"""Simulated battery: drains with driving, charges while Pip sits on the dock.

On the real robot this node is replaced by readings from the microcontroller (pack voltage, current
and the dock-contact sense line), published on the same /battery_state topic.
"""

import math

from nav_msgs.msg import Odometry
import rclpy
from rclpy.node import Node
from sensor_msgs.msg import BatteryState

from .geometry import wrap, yaw_from_quat


class BatterySim(Node):
    def __init__(self):
        super().__init__('battery_sim')
        p = self.declare_parameter
        self.capacity_wh = p('capacity_wh', 20.0).value
        self.idle_w = p('idle_w', 3.0).value
        self.drive_w_per_mps = p('drive_w_per_mps', 12.0).value
        self.turn_w_per_radps = p('turn_w_per_radps', 2.0).value
        self.charge_w = p('charge_w', 25.0).value
        # Makes the battery drain and charge faster than real life so a demo takes minutes, not hours.
        self.speedup = p('speedup', 25.0).value
        # Docked pose in the odom frame. Pip spawns on the dock, so this is the odom origin.
        self.dock = (p('dock_x', 0.0).value, p('dock_y', 0.0).value, p('dock_yaw', 0.0).value)
        self.dock_tol = p('dock_tolerance', 0.08).value
        self.dock_yaw_tol = p('dock_yaw_tolerance', 0.3).value

        self.energy_wh = self.capacity_wh * p('start_fraction', 1.0).value
        self.pose = None
        self.speed = (0.0, 0.0)
        self.last_t = None

        self.pub = self.create_publisher(BatteryState, 'battery_state', 10)
        self.create_subscription(Odometry, 'odom', self.on_odom, 20)
        self.create_timer(0.5, self.tick)

    def on_odom(self, msg: Odometry) -> None:
        p, q = msg.pose.pose.position, msg.pose.pose.orientation
        self.pose = (p.x, p.y, yaw_from_quat(q.x, q.y, q.z, q.w))
        self.speed = (msg.twist.twist.linear.x, msg.twist.twist.angular.z)

    def on_dock(self) -> bool:
        if self.pose is None:
            return False
        x, y, yaw = self.pose
        return (math.hypot(x - self.dock[0], y - self.dock[1]) < self.dock_tol
                and abs(wrap(yaw - self.dock[2])) < self.dock_yaw_tol)

    def tick(self) -> None:
        now = self.get_clock().now().nanoseconds * 1e-9
        dt = 0.0 if self.last_t is None else max(0.0, now - self.last_t)
        self.last_t = now

        charging = self.on_dock()
        if charging:
            power = self.charge_w
        else:
            v, w = self.speed
            power = -(self.idle_w + self.drive_w_per_mps * abs(v) + self.turn_w_per_radps * abs(w))
        self.energy_wh = min(self.capacity_wh,
                             max(0.0, self.energy_wh + power * dt * self.speedup / 3600.0))
        fraction = self.energy_wh / self.capacity_wh

        msg = BatteryState()
        msg.header.stamp = self.get_clock().now().to_msg()
        msg.percentage = float(fraction)
        msg.voltage = float(9.6 + 3.0 * fraction)  # 3S Li-ion, 9.6 V empty to 12.6 V full
        msg.capacity = float(self.capacity_wh / 11.1)
        msg.design_capacity = msg.capacity
        msg.charge = float(self.energy_wh / 11.1)
        msg.present = True
        msg.power_supply_technology = BatteryState.POWER_SUPPLY_TECHNOLOGY_LION
        if charging and fraction >= 0.999:
            msg.power_supply_status = BatteryState.POWER_SUPPLY_STATUS_FULL
        elif charging:
            msg.power_supply_status = BatteryState.POWER_SUPPLY_STATUS_CHARGING
        else:
            msg.power_supply_status = BatteryState.POWER_SUPPLY_STATUS_DISCHARGING
        self.pub.publish(msg)


def main():
    rclpy.init()
    node = BatterySim()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.try_shutdown()
