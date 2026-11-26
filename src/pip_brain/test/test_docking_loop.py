"""Closed-loop check of the docking controller: a simulated robot, simulated lidar, real controller.

Starts Pip at the staging distance with position and heading errors like Nav2 leaves behind, then
runs the same align logic as the docking node until it would hand over to the blind creep.
"""

import math

import numpy as np
import pytest

from pip_brain.dock_detect import approach_command, fit_dock_face, scan_points

FACE_X = 0.0  # dock face along the y axis at x = 0, facing -x; the robot docks at x = -0.11
CONTACT_OFFSET = 0.11
CREEP_START = 0.28


def scan_from(x, y, yaw, n=360, noise=0.004, rng=None):
    """Lidar scan in the robot frame against the dock face, dock sides and the wall behind."""
    segments = [
        (FACE_X, -0.15, FACE_X, 0.15),
        (FACE_X, -0.15, FACE_X + 0.12, -0.15),
        (FACE_X, 0.15, FACE_X + 0.12, 0.15),
        (FACE_X + 0.12, -3.0, FACE_X + 0.12, 3.0),
    ]
    angles = -math.pi + np.arange(n) * (2 * math.pi / n)
    ranges = np.full(n, np.inf)
    for i, a in enumerate(angles):
        d = np.array([math.cos(yaw + a), math.sin(yaw + a)])
        for x1, y1, x2, y2 in segments:
            e = np.array([x2 - x1, y2 - y1])
            m = np.array([[d[0], -e[0]], [d[1], -e[1]]])
            if abs(np.linalg.det(m)) < 1e-12:
                continue
            t, u = np.linalg.solve(m, np.array([x1 - x, y1 - y]))
            if t > 0 and 0 <= u <= 1 and t < ranges[i]:
                ranges[i] = t
    if rng is not None:
        ranges = ranges + rng.normal(0, noise, n)
    return scan_points(ranges, -math.pi, 2 * math.pi / n, 0.12, 8.0)


def expected_face_in_robot_frame(x, y, yaw, map_error=(0.0, 0.0)):
    fx, fy = FACE_X + map_error[0], map_error[1]
    dx, dy = fx - x, fy - y
    c, s = math.cos(-yaw), math.sin(-yaw)
    return c * dx - s * dy, s * dx + c * dy


@pytest.mark.parametrize('start', [
    (-0.71, 0.0, 0.0),
    (-0.71, 0.12, -0.15),
    (-0.65, -0.15, 0.25),
    (-0.80, 0.08, 0.3),
])
def test_align_reaches_creep_handover_on_the_centre_line(start):
    rng = np.random.default_rng(42)
    x, y, yaw = start
    dt = 0.05
    for _ in range(int(40 / dt)):
        pts = scan_from(x, y, yaw, rng=rng)
        obs = fit_dock_face(pts, expected_face_in_robot_frame(x, y, yaw, map_error=(0.03, -0.04)))
        assert obs is not None, f'lost the dock at {(x, y, yaw)}'
        cmd = approach_command(obs, stop_dist=CONTACT_OFFSET)
        if cmd.dist <= CREEP_START:
            assert abs(cmd.lateral) < 0.03, f'lateral error {cmd.lateral:.3f} m at handover'
            if abs(cmd.heading_err) <= 0.05:
                # Blind creep straight ahead: where would the robot centre end up?
                creep = cmd.dist - CONTACT_OFFSET + 0.01
                final_y = y + creep * math.sin(yaw)
                assert abs(final_y) < 0.04
                assert abs(yaw) < 0.06
                return
            v, w = 0.0, max(-0.5, min(0.5, 1.5 * cmd.heading_err))
        else:
            v, w = cmd.v, cmd.w
        x += v * math.cos(yaw) * dt
        y += v * math.sin(yaw) * dt
        yaw += w * dt
    pytest.fail('never reached the creep handover')
