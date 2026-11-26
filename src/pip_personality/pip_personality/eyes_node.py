"""Shows Pip's eyes in a window (in simulation) driven by its mood and turning."""

import json
import os
import time

from geometry_msgs.msg import Twist
import rclpy
from rclpy.node import Node
from std_msgs.msg import String


class EyesNode(Node):
    def __init__(self):
        super().__init__('eyes')
        self.mood = 'neutral'
        self.battery = None
        self.turn = 0.0
        self.last = time.monotonic()
        self.enabled = False
        try:
            import pygame  # noqa: PLC0415  (imported lazily so the node can run without a display)

            from .eyes_render import EyeRenderer
            if not (os.environ.get('DISPLAY') or os.environ.get('WAYLAND_DISPLAY')):
                raise RuntimeError('no display available')
            pygame.init()
            self.pygame = pygame
            self.screen = pygame.display.set_mode((540, 320))
            pygame.display.set_caption('Pip')
            self.renderer = EyeRenderer()
            self.enabled = True
        except Exception as exc:  # noqa: BLE001
            self.get_logger().warn(f'eyes window disabled: {exc}')

        self.create_subscription(String, 'pip/mood', self.on_mood, 10)
        self.create_subscription(Twist, 'cmd_vel', self.on_cmd_vel, 10)
        if self.enabled:
            self.create_timer(1.0 / 30.0, self.tick)

    def on_mood(self, msg: String) -> None:
        try:
            data = json.loads(msg.data)
            self.mood = data.get('mood', 'neutral')
            self.battery = data.get('battery')
        except ValueError:
            self.mood = msg.data

    def on_cmd_vel(self, msg: Twist) -> None:
        self.turn = msg.angular.z

    def tick(self) -> None:
        for event in self.pygame.event.get():
            if event.type == self.pygame.QUIT:
                self.pygame.display.iconify()
        now = time.monotonic()
        dt, self.last = now - self.last, now
        self.renderer.update(dt, self.mood, self.turn)
        caption = self.mood
        if self.battery is not None:
            caption += f'   ·   battery {self.battery * 100:.0f}%'
        self.renderer.draw(self.screen, caption)
        self.pygame.display.flip()


def main():
    rclpy.init()
    node = EyesNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.try_shutdown()
