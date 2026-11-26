import math

import numpy as np

from pip_brain.dock_detect import approach_command, fit_dock_face, scan_points


def ray_cast_scan(segments, n=360, rmax=8.0, noise=0.0, seed=1):
    """Cast a 360 degree scan from the origin against line segments [(x1, y1, x2, y2), ...]."""
    rng = np.random.default_rng(seed)
    angles = -math.pi + np.arange(n) * (2 * math.pi / n)
    ranges = np.full(n, np.inf)
    for i, a in enumerate(angles):
        d = np.array([math.cos(a), math.sin(a)])
        for x1, y1, x2, y2 in segments:
            p, e = np.array([x1, y1]), np.array([x2 - x1, y2 - y1])
            m = np.array([[d[0], -e[0]], [d[1], -e[1]]])
            if abs(np.linalg.det(m)) < 1e-12:
                continue
            t, u = np.linalg.solve(m, p)
            if t > 0 and 0 <= u <= 1 and t < ranges[i]:
                ranges[i] = t
    ranges = np.where(np.isfinite(ranges), ranges + rng.normal(0, noise, n), np.inf)
    return ranges, -math.pi, 2 * math.pi / n


def dock_scene(dist, lateral=0.0):
    """Dock face (0.30 wide) at x = dist, wall 0.12 m behind it, robot at the origin facing +x."""
    face_x, wall_x = dist, dist + 0.12
    return [
        (face_x, lateral - 0.15, face_x, lateral + 0.15),  # dock face
        (face_x, lateral - 0.15, wall_x, lateral - 0.15),  # dock sides
        (face_x, lateral + 0.15, wall_x, lateral + 0.15),
        (wall_x, -3.0, wall_x, 3.0),  # wall
    ]


def test_finds_dock_face_in_front_of_wall():
    ranges, amin, ainc = ray_cast_scan(dock_scene(0.6, lateral=0.05), noise=0.003)
    pts = scan_points(ranges, amin, ainc, 0.12, 8.0)
    obs = fit_dock_face(pts, expected=(0.62, 0.0))
    assert obs is not None
    assert abs(obs.center[0] - 0.6) < 0.02
    assert abs(obs.center[1] - 0.05) < 0.03
    assert obs.normal[0] < -0.99  # normal points back at the robot


def test_rejects_plain_wall():
    ranges, amin, ainc = ray_cast_scan([(0.6, -3.0, 0.6, 3.0)], noise=0.003)
    pts = scan_points(ranges, amin, ainc, 0.12, 8.0)
    assert fit_dock_face(pts, expected=(0.6, 0.0)) is None  # too wide to be the dock


def test_approach_command_turns_towards_centre_line():
    ranges, amin, ainc = ray_cast_scan(dock_scene(0.6, lateral=0.10))
    pts = scan_points(ranges, amin, ainc, 0.12, 8.0)
    obs = fit_dock_face(pts, expected=(0.6, 0.1))
    cmd = approach_command(obs, stop_dist=0.11)
    assert cmd.w > 0  # dock is to the left, turn left
    assert abs(cmd.dist - 0.6) < 0.02
    assert abs(cmd.lateral - 0.10) < 0.02  # centre line is 10 cm to the robot's left
    assert 0.0 < cmd.v <= 0.10


def test_aligned_robot_drives_straight():
    ranges, amin, ainc = ray_cast_scan(dock_scene(0.4))
    pts = scan_points(ranges, amin, ainc, 0.12, 8.0)
    obs = fit_dock_face(pts, expected=(0.4, 0.0))
    cmd = approach_command(obs, stop_dist=0.11)
    assert abs(cmd.w) < 0.05
    assert abs(cmd.heading_err) < 0.03
