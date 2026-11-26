"""Pip's top-level behaviour: decide what to do next.

    docked --(charged)--> undocking --> exploring --(map done)--> patrolling
       ^                                    |                         |
       +---------- returning <--(battery low or "dock" command)-------+

Commands on pip/command: explore, patrol, dock (or home), stop, sleep, wake, hello.
State on pip/state, personality events on pip/events.
"""

import json

from nav_msgs.msg import OccupancyGrid
import numpy as np
import rclpy
from rclpy.node import Node
from sensor_msgs.msg import BatteryState
from std_msgs.msg import String
from tf2_ros import Buffer, TransformListener

from .explorer import MAP_QOS
from .frontiers import grid_from_msg
from .patrol import pick_patrol_point
from .ros_util import lookup_pose, make_pose, NavClient, send_event, send_text

CHARGING = (BatteryState.POWER_SUPPLY_STATUS_CHARGING, BatteryState.POWER_SUPPLY_STATUS_FULL)


class Brain(Node):
    def __init__(self):
        super().__init__('brain')
        p = self.declare_parameter
        self.low_battery = p('low_battery', 0.25).value
        self.resume_battery = p('resume_battery', 0.90).value
        self.patrol_pause = p('patrol_pause', 6.0).value
        self.patrol_min_distance = p('patrol_min_distance', 1.5).value
        self.activity = p('start_activity', 'explore').value  # explore | patrol | idle

        self.tf_buffer = Buffer()
        self.tf_listener = TransformListener(self.tf_buffer, self)
        self.nav = NavClient(self)
        self.rng = np.random.default_rng()

        self.state_pub = self.create_publisher(String, 'pip/state', 10)
        self.event_pub = self.create_publisher(String, 'pip/events', 10)
        self.dock_pub = self.create_publisher(String, 'pip/dock_cmd', 10)
        self.explore_pub = self.create_publisher(String, 'pip/explore_cmd', 10)
        self.create_subscription(BatteryState, 'battery_state', self.on_battery, 10)
        self.create_subscription(String, 'pip/dock_status', self.on_dock_status, 10)
        self.create_subscription(String, 'pip/explore_status', self.on_explore_status, 10)
        self.create_subscription(String, 'pip/command', self.on_command, 10)
        self.create_subscription(OccupancyGrid, 'map', self.on_map, MAP_QOS)

        self.state = 'boot'
        self.t_state = 0.0
        self.battery = None
        self.charging = False
        self.dock_status = 'idle'
        self.explore_status = 'idle'
        self.explored = False
        self.sleeping = False
        self.low_announced = False
        self.dock_failures = 0
        self.pause_until = 0.0
        self.map = None

        self.create_timer(0.5, self.tick)
        self.create_timer(1.0, lambda: send_text(self.state_pub, self.state))

    # --- helpers -------------------------------------------------------------------------------

    def now(self) -> float:
        return self.get_clock().now().nanoseconds * 1e-9

    def set_state(self, state: str) -> None:
        if state != self.state:
            self.get_logger().info(f'{self.state} -> {state}')
            self.state = state
            self.t_state = self.now()
            send_text(self.state_pub, state)

    def command_dock(self, cmd: str) -> None:
        send_text(self.dock_pub, cmd)

    def command_explore(self, cmd: str) -> None:
        send_text(self.explore_pub, cmd)

    def battery_low(self) -> bool:
        return self.battery is not None and self.battery < self.low_battery and not self.charging

    # --- callbacks -----------------------------------------------------------------------------

    def on_battery(self, msg: BatteryState) -> None:
        self.battery = msg.percentage
        self.charging = msg.power_supply_status in CHARGING
        if self.battery >= self.low_battery + 0.05:
            self.low_announced = False

    def on_dock_status(self, msg: String) -> None:
        self.dock_status = msg.data

    def on_explore_status(self, msg: String) -> None:
        self.explore_status = msg.data

    def on_map(self, msg: OccupancyGrid) -> None:
        info = msg.info
        self.map = (grid_from_msg(msg.data, info.width, info.height), info.resolution,
                    (info.origin.position.x, info.origin.position.y))

    def on_command(self, msg: String) -> None:
        text = msg.data.strip().lower()
        try:  # accept either plain text or {"command": "..."}
            text = str(json.loads(text).get('command', text)).lower()
        except (ValueError, AttributeError):
            pass
        self.get_logger().info(f'command: {text}')

        if text in ('explore', 'patrol'):
            self.activity = text
            self.sleeping = False
            if text == 'explore':
                self.explored = False
            self.leave_or_switch()
        elif text in ('dock', 'home', 'go home'):
            self.go_home()
        elif text == 'stop':
            self.nav.cancel()
            self.command_explore('stop')
            self.activity = 'idle'
            if self.state not in ('docked', 'undocking'):
                self.command_dock('cancel')
                self.set_state('idle')
        elif text == 'sleep':
            self.sleeping = True
            send_event(self.event_pub, 'sleep')
            self.go_home()
        elif text == 'wake':
            self.sleeping = False
            send_event(self.event_pub, 'wake')
        elif text in ('hello', 'hi'):
            send_event(self.event_pub, 'greet')

    # --- transitions ---------------------------------------------------------------------------

    def leave_or_switch(self) -> None:
        if self.state == 'docked':
            if self.battery is not None and self.battery > self.low_battery + 0.1:
                self.undock()
        elif self.state in ('patrolling', 'exploring', 'idle', 'stranded'):
            self.nav.cancel()
            self.command_explore('stop')
            self.start_activity()

    def undock(self) -> None:
        self.dock_status = 'undocking'
        self.command_dock('undock')
        send_event(self.event_pub, 'undocking')
        self.set_state('undocking')

    def go_home(self) -> None:
        self.nav.cancel()
        self.command_explore('stop')
        if self.charging:
            self.set_state('docked')
            return
        self.dock_failures = 0
        self.dock_status = 'docking'
        self.command_dock('dock')
        self.set_state('returning')

    def start_activity(self) -> None:
        if self.activity == 'explore' and not self.explored:
            self.explore_status = 'exploring'
            self.command_explore('start')
            self.set_state('exploring')
        elif self.activity in ('explore', 'patrol'):
            self.pause_until = 0.0
            self.set_state('patrolling')
        else:
            self.set_state('idle')

    def tick(self) -> None:
        state = self.state
        if state == 'boot':
            if self.battery is None or not self.nav.ready():
                return
            send_event(self.event_pub, 'boot')
            self.set_state('docked' if self.charging else 'idle')
            if not self.charging:
                self.start_activity()
            return

        if self.battery_low() and state in ('exploring', 'patrolling', 'idle'):
            if not self.low_announced:
                send_event(self.event_pub, 'low_battery', percent=round(self.battery * 100))
                self.low_announced = True
            self.go_home()
            return

        if state == 'docked':
            if not self.charging and self.now() - self.t_state > 5.0:
                self.set_state('idle')  # someone picked Pip up
            elif (not self.sleeping and self.activity != 'idle' and self.battery is not None
                    and self.battery >= self.resume_battery):
                self.undock()
        elif state == 'undocking':
            if self.dock_status == 'undocked':
                self.start_activity()
            elif self.now() - self.t_state > 15.0:
                self.start_activity()
        elif state == 'exploring':
            if self.explore_status == 'done':
                self.explored = True
                self.start_activity()
        elif state == 'patrolling':
            self.patrol_step()
        elif state == 'returning':
            if self.dock_status == 'docked' or self.charging:
                self.dock_failures = 0
                self.set_state('docked')
            elif self.dock_status == 'failed':
                self.dock_failures += 1
                if self.dock_failures >= 3:
                    send_event(self.event_pub, 'stranded')
                    self.set_state('stranded')
                else:
                    self.dock_status = 'docking'
                    self.command_dock('dock')
        elif state == 'stranded':
            if self.charging:
                self.set_state('docked')

    def patrol_step(self) -> None:
        if self.nav.busy:
            return
        if self.nav.state == 'succeeded':
            send_event(self.event_pub, 'patrol_arrived')
            self.pause_until = self.now() + self.patrol_pause
        elif self.nav.state == 'failed':
            send_event(self.event_pub, 'nav_failed')
            self.pause_until = self.now() + 2.0
        self.nav.clear()
        if self.now() < self.pause_until or self.map is None:
            return
        pose = lookup_pose(self.tf_buffer)
        if pose is None:
            return
        grid, res, origin = self.map
        point = pick_patrol_point(grid, res, origin, pose[:2], self.rng,
                                  min_distance=self.patrol_min_distance)
        if point is None:
            self.pause_until = self.now() + 5.0
            return
        yaw = float(self.rng.uniform(-3.14159, 3.14159))
        self.nav.go(make_pose(self, point[0], point[1], yaw))


def main():
    rclpy.init()
    node = Brain()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.try_shutdown()
