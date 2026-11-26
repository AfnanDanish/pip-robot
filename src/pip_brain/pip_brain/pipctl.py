"""Send Pip a command from the terminal: `ros2 run pip_brain pipctl explore`.

Commands: explore, patrol, dock, stop, sleep, wake, hello.
"""

import sys
import time

import rclpy
from rclpy.node import Node
from rclpy.utilities import remove_ros_args
from std_msgs.msg import String


def main():
    rclpy.init()
    args = remove_ros_args(sys.argv)[1:]
    text = ' '.join(args) or 'hello'
    node = Node('pipctl')
    pub = node.create_publisher(String, 'pip/command', 10)
    deadline = time.monotonic() + 3.0
    while pub.get_subscription_count() == 0 and time.monotonic() < deadline:
        rclpy.spin_once(node, timeout_sec=0.1)
    if pub.get_subscription_count() == 0:
        print('Pip is not running (no one is listening on pip/command).')
    msg = String()
    msg.data = text
    pub.publish(msg)
    rclpy.spin_once(node, timeout_sec=0.3)
    print(f'sent: {text}')
    node.destroy_node()
    rclpy.try_shutdown()
