"""Helpers shared by Pip's ROS nodes."""

import json

from action_msgs.msg import GoalStatus
from geometry_msgs.msg import PoseStamped
from nav2_msgs.action import NavigateToPose
from rclpy.action import ActionClient
from rclpy.time import Time
from std_msgs.msg import String
from tf2_ros import TransformException

from .geometry import quat_from_yaw, yaw_from_quat


def make_pose(node, x: float, y: float, yaw: float, frame: str = 'map') -> PoseStamped:
    pose = PoseStamped()
    pose.header.frame_id = frame
    pose.header.stamp = node.get_clock().now().to_msg()
    pose.pose.position.x = float(x)
    pose.pose.position.y = float(y)
    qx, qy, qz, qw = quat_from_yaw(yaw)
    pose.pose.orientation.x, pose.pose.orientation.y = qx, qy
    pose.pose.orientation.z, pose.pose.orientation.w = qz, qw
    return pose


def lookup_pose(tf_buffer, target: str = 'map', source: str = 'base_footprint'):
    """(x, y, yaw) of `source` in `target`, or None if the transform isn't available yet."""
    try:
        t = tf_buffer.lookup_transform(target, source, Time())
    except TransformException:
        return None
    tr, q = t.transform.translation, t.transform.rotation
    return tr.x, tr.y, yaw_from_quat(q.x, q.y, q.z, q.w)


def send_text(pub, text: str) -> None:
    msg = String()
    msg.data = text
    pub.publish(msg)


def send_event(pub, kind: str, **data) -> None:
    send_text(pub, json.dumps({'type': kind, **data}))


class NavClient:
    """Thin wrapper around Nav2's NavigateToPose action with a simple polled state.

    state: idle | pending | active | succeeded | failed | canceled
    """

    def __init__(self, node):
        self.node = node
        self.client = ActionClient(node, NavigateToPose, 'navigate_to_pose')
        self.state = 'idle'
        self.goal_xy = None
        self._handle = None
        self._token = None

    def ready(self) -> bool:
        return self.client.server_is_ready()

    @property
    def busy(self) -> bool:
        return self.state in ('pending', 'active')

    def go(self, pose: PoseStamped) -> bool:
        self.cancel()
        if not self.ready():
            self.state = 'failed'
            return False
        token = self._token = object()
        goal = NavigateToPose.Goal()
        goal.pose = pose
        self.goal_xy = (pose.pose.position.x, pose.pose.position.y)
        self.state = 'pending'
        future = self.client.send_goal_async(goal)
        future.add_done_callback(lambda f: self._on_accept(f, token))
        return True

    def cancel(self) -> None:
        self._token = None
        if self._handle is not None:
            self._handle.cancel_goal_async()
            self._handle = None
        self.state = 'idle'

    def clear(self) -> None:
        """Acknowledge a finished result so the caller can send the next goal."""
        if not self.busy:
            self.state = 'idle'

    def _on_accept(self, future, token) -> None:
        handle = future.result()
        if token is not self._token:
            if handle.accepted:
                handle.cancel_goal_async()
            return
        if not handle.accepted:
            self.state = 'failed'
            return
        self._handle = handle
        self.state = 'active'
        handle.get_result_async().add_done_callback(lambda f: self._on_result(f, token))

    def _on_result(self, future, token) -> None:
        if token is not self._token:
            return
        status = future.result().status
        self._handle = None
        if status == GoalStatus.STATUS_SUCCEEDED:
            self.state = 'succeeded'
        elif status == GoalStatus.STATUS_CANCELED:
            self.state = 'canceled'
        else:
            self.state = 'failed'
