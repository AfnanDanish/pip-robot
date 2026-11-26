"""Frontier-based exploration: keep driving to the edge of the known map until nothing is left.

Commands on pip/explore_cmd ("start", "stop"); status on pip/explore_status
("idle", "exploring", "done").
"""

import math

from nav_msgs.msg import OccupancyGrid
import rclpy
from rclpy.node import Node
from rclpy.qos import DurabilityPolicy, QoSProfile, ReliabilityPolicy
from std_msgs.msg import String
from tf2_ros import Buffer, TransformListener

from .frontiers import choose_frontier, find_frontiers, grid_from_msg, still_frontier
from .ros_util import lookup_pose, make_pose, NavClient, send_event, send_text

MAP_QOS = QoSProfile(depth=1, durability=DurabilityPolicy.TRANSIENT_LOCAL,
                     reliability=ReliabilityPolicy.RELIABLE)


class Explorer(Node):
    def __init__(self):
        super().__init__('explorer')
        p = self.declare_parameter
        self.min_size = p('min_frontier_size', 10).value
        self.goal_timeout = p('goal_timeout', 90.0).value
        self.blacklist_radius = p('blacklist_radius', 0.5).value
        self.empty_checks_to_finish = p('empty_checks_to_finish', 4).value

        self.tf_buffer = Buffer()
        self.tf_listener = TransformListener(self.tf_buffer, self)
        self.nav = NavClient(self)
        self.status_pub = self.create_publisher(String, 'pip/explore_status', 10)
        self.event_pub = self.create_publisher(String, 'pip/events', 10)
        self.create_subscription(OccupancyGrid, 'map', self.on_map, MAP_QOS)
        self.create_subscription(String, 'pip/explore_cmd', self.on_cmd, 10)

        self.map = None
        self.exploring = False
        self.status = 'idle'
        self.blacklist: list[tuple[float, float]] = []
        self.goal_t = 0.0
        self.empty_checks = 0
        self.goals_reached = 0

        self.create_timer(1.0, self.tick)
        self.create_timer(1.0, lambda: send_text(self.status_pub, self.status))

    def now(self) -> float:
        return self.get_clock().now().nanoseconds * 1e-9

    def set_status(self, status: str) -> None:
        if status != self.status:
            self.status = status
            send_text(self.status_pub, status)

    def on_map(self, msg: OccupancyGrid) -> None:
        info = msg.info
        self.map = (grid_from_msg(msg.data, info.width, info.height), info.resolution,
                    (info.origin.position.x, info.origin.position.y))

    def on_cmd(self, msg: String) -> None:
        cmd = msg.data.strip().lower()
        if cmd == 'start':
            self.exploring = True
            self.empty_checks = 0
            self.blacklist.clear()
            self.set_status('exploring')
            send_event(self.event_pub, 'exploration_started')
        elif cmd == 'stop':
            self.exploring = False
            self.nav.cancel()
            self.set_status('idle')

    def tick(self) -> None:
        if not self.exploring or self.map is None or not self.nav.ready():
            return
        grid, res, origin = self.map

        if self.nav.busy:
            if self.now() - self.goal_t > self.goal_timeout:
                self.get_logger().warn('frontier goal timed out')
                self.blacklist.append(self.nav.goal_xy)
                self.nav.cancel()
            elif self.nav.goal_xy and not still_frontier(grid, res, origin, self.nav.goal_xy):
                self.nav.cancel()  # already revealed on the way, move on
            else:
                return
        elif self.nav.state == 'failed':
            self.blacklist.append(self.nav.goal_xy)
            send_event(self.event_pub, 'nav_failed')
            self.nav.clear()
        elif self.nav.state == 'succeeded':
            self.goals_reached += 1
            self.blacklist.append(self.nav.goal_xy)
            self.nav.clear()

        pose = lookup_pose(self.tf_buffer)
        if pose is None:
            return
        frontiers = find_frontiers(grid, res, origin, self.min_size)
        target = choose_frontier(frontiers, pose[:2], res, self.blacklist, self.blacklist_radius)
        if target is None:
            self.empty_checks += 1
            if self.empty_checks >= self.empty_checks_to_finish:
                self.exploring = False
                self.set_status('done')
                send_event(self.event_pub, 'exploration_done', goals=self.goals_reached)
                self.get_logger().info('exploration finished')
            return

        self.empty_checks = 0
        gx, gy = target.goal
        yaw = math.atan2(gy - pose[1], gx - pose[0])
        self.nav.go(make_pose(self, gx, gy, yaw))
        self.goal_t = self.now()
        send_event(self.event_pub, 'new_frontier', size=target.size)


def main():
    rclpy.init()
    node = Explorer()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.try_shutdown()
