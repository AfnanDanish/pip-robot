"""Autonomous docking and undocking.

Docking runs in stages:
  1. nav_staging  - Nav2 drives to a staging pose 0.6 m in front of the dock.
  2. align        - the lidar finds the dock's front face; a carrot controller lines Pip up with it.
  3. creep        - the last few centimetres are too close for the lidar, so Pip creeps straight
                    in on wheel odometry.
  4. wait_charge  - success means the battery reports charging. If not, back off and retry.

Commands arrive on pip/dock_cmd ("dock", "undock", "cancel"); progress goes out on
pip/dock_status ("idle", "docking", "docked", "undocking", "undocked", "failed").
"""

import math

from geometry_msgs.msg import Twist
from nav_msgs.msg import Odometry
import rclpy
from rclpy.node import Node
from rclpy.qos import qos_profile_sensor_data
from sensor_msgs.msg import BatteryState, LaserScan
from std_msgs.msg import String
from tf2_ros import Buffer, TransformListener

from .dock_detect import approach_command, fit_dock_face, scan_points
from .geometry import to_local, wrap
from .ros_util import lookup_pose, make_pose, NavClient, send_event, send_text

CHARGING = (BatteryState.POWER_SUPPLY_STATUS_CHARGING, BatteryState.POWER_SUPPLY_STATUS_FULL)


class Docking(Node):
    def __init__(self):
        super().__init__('docking')
        p = self.declare_parameter
        # Pose of base_footprint when Pip is docked, in the map frame.
        self.dock = (p('dock_x', 0.0).value, p('dock_y', 0.0).value, p('dock_yaw', 0.0).value)
        self.contact_offset = p('contact_offset', 0.11).value  # robot centre to dock face, docked
        self.staging_dist = p('staging_dist', 0.6).value
        self.creep_start = p('creep_start', 0.28).value
        self.max_retries = p('max_retries', 3).value

        self.tf_buffer = Buffer()
        self.tf_listener = TransformListener(self.tf_buffer, self)
        self.nav = NavClient(self)
        self.cmd_pub = self.create_publisher(Twist, 'cmd_vel', 10)
        self.status_pub = self.create_publisher(String, 'pip/dock_status', 10)
        self.event_pub = self.create_publisher(String, 'pip/events', 10)
        self.create_subscription(LaserScan, 'scan', self.on_scan, qos_profile_sensor_data)
        self.create_subscription(Odometry, 'odom', self.on_odom, 20)
        self.create_subscription(BatteryState, 'battery_state', self.on_battery, 10)
        self.create_subscription(String, 'pip/dock_cmd', self.on_cmd, 10)

        self.scan = None
        self.scan_t = 0.0
        self.odom_xy = None
        self.charging = False
        self.state = 'idle'
        self.status = 'idle'
        self.t_state = 0.0
        self.retries = 0
        self.move_origin = None
        self.move_target = 0.0
        self.move_speed = 0.0

        self.create_timer(0.05, self.tick)
        self.create_timer(1.0, lambda: send_text(self.status_pub, self.status))

    # --- helpers -------------------------------------------------------------------------------

    def now(self) -> float:
        return self.get_clock().now().nanoseconds * 1e-9

    def set_state(self, state: str, status: str | None = None) -> None:
        if state != self.state:
            self.get_logger().info(f'{self.state} -> {state}')
        self.state = state
        self.t_state = self.now()
        if status is not None and status != self.status:
            self.status = status
            send_text(self.status_pub, status)

    def drive(self, v: float, w: float) -> None:
        msg = Twist()
        msg.linear.x = float(v)
        msg.angular.z = float(w)
        self.cmd_pub.publish(msg)

    def stop(self) -> None:
        self.drive(0.0, 0.0)

    def moved(self) -> float:
        if self.move_origin is None or self.odom_xy is None:
            return 0.0
        return math.dist(self.odom_xy, self.move_origin)

    def start_move(self, distance: float, state: str, status: str | None = None,
                   speed: float = 0.08) -> None:
        self.move_origin = self.odom_xy
        self.move_target = abs(distance)
        self.move_speed = math.copysign(speed, distance)
        self.set_state(state, status)

    def staging_pose(self) -> tuple[float, float, float]:
        x, y, yaw = self.dock
        return (x - self.staging_dist * math.cos(yaw), y - self.staging_dist * math.sin(yaw), yaw)

    # --- callbacks -----------------------------------------------------------------------------

    def on_scan(self, msg: LaserScan) -> None:
        self.scan = msg
        self.scan_t = self.now()

    def on_odom(self, msg: Odometry) -> None:
        p = msg.pose.pose.position
        self.odom_xy = (p.x, p.y)

    def on_battery(self, msg: BatteryState) -> None:
        self.charging = msg.power_supply_status in CHARGING
        if self.charging and self.state == 'idle' and self.status != 'docked':
            self.set_state('docked', 'docked')

    def on_cmd(self, msg: String) -> None:
        cmd = msg.data.strip().lower()
        if cmd == 'dock':
            if self.charging:
                self.set_state('docked', 'docked')
                return
            self.retries = 0
            self.start_staging()
        elif cmd == 'undock':
            self.nav.cancel()
            self.start_move(-0.35, 'undocking', 'undocking')
        elif cmd == 'cancel':
            self.nav.cancel()
            if self.state not in ('idle', 'docked'):
                self.stop()
            self.set_state('idle', 'docked' if self.charging else 'idle')

    # --- state machine -------------------------------------------------------------------------

    def start_staging(self) -> None:
        sx, sy, syaw = self.staging_pose()
        pose = lookup_pose(self.tf_buffer)
        if (pose is not None and math.hypot(pose[0] - sx, pose[1] - sy) < 0.2
                and abs(wrap(pose[2] - syaw)) < 0.4):
            self.set_state('align', 'docking')
            return
        self.nav.go(make_pose(self, sx, sy, syaw))
        self.set_state('nav_staging', 'docking')

    def retry(self, reason: str) -> None:
        self.retries += 1
        self.get_logger().warn(f'docking attempt failed: {reason} ({self.retries}/{self.max_retries})')
        if self.retries > self.max_retries:
            self.nav.cancel()
            self.stop()
            self.set_state('idle', 'failed')
            send_event(self.event_pub, 'dock_failed', final=True)
            return
        send_event(self.event_pub, 'dock_failed', final=False)
        if self.state in ('nav_staging', 'align'):
            self.start_staging()
        else:
            self.start_move(-0.30, 'backoff')

    def observe(self):
        if self.scan is None or self.now() - self.scan_t > 0.5:
            return None
        pose = lookup_pose(self.tf_buffer)
        if pose is None:
            return None
        dx, dy, dyaw = self.dock
        face = (dx + self.contact_offset * math.cos(dyaw), dy + self.contact_offset * math.sin(dyaw))
        expected = to_local(face[0], face[1], *pose)
        s = self.scan
        points = scan_points(s.ranges, s.angle_min, s.angle_increment, s.range_min, s.range_max)
        return fit_dock_face(points, expected)

    def tick(self) -> None:
        state = self.state
        if state == 'nav_staging':
            if self.nav.state == 'succeeded':
                self.nav.clear()
                self.set_state('align')
            elif self.nav.state in ('failed', 'canceled'):
                self.nav.clear()
                self.retry('could not reach the staging pose')
        elif state == 'align':
            self.align_step()
        elif state == 'creep':
            if self.charging or self.moved() >= self.move_target or self.now() - self.t_state > 8.0:
                self.stop()
                self.set_state('wait_charge')
            else:
                self.drive(self.move_speed, 0.0)
        elif state == 'wait_charge':
            self.stop()
            if self.charging:
                self.set_state('docked', 'docked')
                send_event(self.event_pub, 'docked')
            elif self.now() - self.t_state > 3.0:
                self.retry('no charging contact')
        elif state in ('backoff', 'undocking'):
            if self.moved() >= self.move_target or self.now() - self.t_state > 10.0:
                self.stop()
                if state == 'backoff':
                    self.set_state('align')
                else:
                    self.set_state('idle', 'undocked')
            else:
                self.drive(self.move_speed, 0.0)

    def align_step(self) -> None:
        obs = self.observe()
        if obs is None:
            self.stop()
            if self.now() - self.t_state > 4.0:
                self.retry('dock not visible')
            return
        cmd = approach_command(obs, stop_dist=self.contact_offset)
        if cmd.dist <= self.creep_start:
            if abs(cmd.lateral) > 0.03:
                self.retry(f'off the centre line by {cmd.lateral:.3f} m')
                return
            if abs(cmd.heading_err) > 0.05:
                self.drive(0.0, max(-0.5, min(0.5, 1.5 * cmd.heading_err)))
                return
            self.stop()
            self.start_move(cmd.dist - self.contact_offset + 0.01, 'creep', speed=0.04)
            return
        self.drive(cmd.v, cmd.w)


def main():
    rclpy.init()
    node = Docking()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.try_shutdown()
