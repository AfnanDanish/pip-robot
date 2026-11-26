"""ROS node around the mood engine: listens to the robot, publishes Pip's mood, beeps and lines."""

import json
import math
import time

from geometry_msgs.msg import Twist
import rclpy
from rclpy.node import Node
from rclpy.qos import qos_profile_sensor_data
from sensor_msgs.msg import BatteryState, LaserScan
from std_msgs.msg import String

from .mood import MoodEngine

CHARGING = (BatteryState.POWER_SUPPLY_STATUS_CHARGING, BatteryState.POWER_SUPPLY_STATUS_FULL)


class MoodNode(Node):
    def __init__(self):
        super().__init__('mood')
        self.close_call_dist = self.declare_parameter('close_call_distance', 0.20).value
        self.engine = MoodEngine()
        self.mood_pub = self.create_publisher(String, 'pip/mood', 10)
        self.sound_pub = self.create_publisher(String, 'pip/sound', 10)
        self.say_pub = self.create_publisher(String, 'pip/say', 10)
        self.create_subscription(String, 'pip/events', self.on_event, 20)
        self.create_subscription(BatteryState, 'battery_state', self.on_battery, 10)
        self.create_subscription(Twist, 'cmd_vel', self.on_cmd_vel, 10)
        self.create_subscription(LaserScan, 'scan', self.on_scan, qos_profile_sensor_data)
        self.create_subscription(String, 'pip/dock_status', self.on_dock_status, 10)
        self.forward = 0.0
        self.docking = False
        self.last_close_call = 0.0
        self.last_mood = None
        self.last_publish = 0.0
        self.create_timer(0.2, self.tick)

    @staticmethod
    def now() -> float:
        return time.monotonic()

    def act(self, actions) -> None:
        for kind, payload in actions:
            msg = String()
            msg.data = payload
            (self.sound_pub if kind == 'sound' else self.say_pub).publish(msg)
            if kind == 'say':
                self.get_logger().info(f'Pip: "{payload}"')

    def on_event(self, msg: String) -> None:
        try:
            event = json.loads(msg.data)
            kind = event.get('type', '')
        except ValueError:
            kind = msg.data.strip()
        self.act(self.engine.on_event(kind, self.now()))
        self.tick()

    def on_battery(self, msg: BatteryState) -> None:
        charging = msg.power_supply_status in CHARGING
        full = msg.power_supply_status == BatteryState.POWER_SUPPLY_STATUS_FULL
        self.act(self.engine.on_battery(msg.percentage, charging, full, self.now()))

    def on_cmd_vel(self, msg: Twist) -> None:
        self.forward = msg.linear.x
        self.engine.on_motion(msg.linear.x, msg.angular.z)

    def on_dock_status(self, msg: String) -> None:
        self.docking = msg.data in ('docking', 'undocking')

    def on_scan(self, msg: LaserScan) -> None:
        if self.docking or self.forward < 0.05:
            return
        nearest = math.inf
        for i, r in enumerate(msg.ranges):
            a = msg.angle_min + i * msg.angle_increment
            if abs(a) < 0.8 and msg.range_min < r < nearest:
                nearest = r
        now = self.now()
        if nearest < self.close_call_dist and now - self.last_close_call > 5.0:
            self.last_close_call = now
            self.act(self.engine.on_event('close_call', now))

    def tick(self) -> None:
        now = self.now()
        mood = self.engine.tick(now)
        if mood != self.last_mood or now - self.last_publish > 1.0:
            msg = String()
            msg.data = json.dumps({'mood': mood, 'battery': round(self.engine.battery, 3)})
            self.mood_pub.publish(msg)
            self.last_mood, self.last_publish = mood, now


def main():
    rclpy.init()
    node = MoodNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.try_shutdown()
