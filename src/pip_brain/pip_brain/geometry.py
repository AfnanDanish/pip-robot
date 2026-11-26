"""Planar geometry helpers (no ROS imports, so they unit-test anywhere)."""

import math


def wrap(angle: float) -> float:
    """Wrap an angle to [-pi, pi)."""
    return (angle + math.pi) % (2.0 * math.pi) - math.pi


def yaw_from_quat(x: float, y: float, z: float, w: float) -> float:
    return math.atan2(2.0 * (w * z + x * y), 1.0 - 2.0 * (y * y + z * z))


def quat_from_yaw(yaw: float) -> tuple[float, float, float, float]:
    return 0.0, 0.0, math.sin(yaw / 2.0), math.cos(yaw / 2.0)


def to_local(px: float, py: float, ox: float, oy: float, oyaw: float) -> tuple[float, float]:
    """Express world point (px, py) in a frame at (ox, oy) rotated by oyaw."""
    dx, dy = px - ox, py - oy
    c, s = math.cos(-oyaw), math.sin(-oyaw)
    return c * dx - s * dy, s * dx + c * dy
