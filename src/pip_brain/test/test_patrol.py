import math

import numpy as np

from pip_brain.geometry import quat_from_yaw, to_local, wrap, yaw_from_quat
from pip_brain.patrol import erode, pick_patrol_point


def test_erode_shrinks_free_space_by_radius():
    mask = np.zeros((20, 20), dtype=bool)
    mask[5:15, 5:15] = True
    eroded = erode(mask, 2)
    assert eroded[7:13, 7:13].all()
    assert not eroded[5, 10] and not eroded[6, 10]


def test_patrol_point_is_far_and_clear():
    grid = np.full((60, 60), 100, dtype=np.int8)
    grid[5:55, 5:55] = 0
    rng = np.random.default_rng(0)
    for _ in range(20):
        x, y = pick_patrol_point(grid, 0.05, (0.0, 0.0), (0.5, 0.5), rng,
                                 clearance=0.3, min_distance=1.0)
        assert math.dist((x, y), (0.5, 0.5)) >= 1.0
        assert 0.25 + 0.3 <= x <= 2.75 - 0.3 + 0.05
        assert 0.25 + 0.3 <= y <= 2.75 - 0.3 + 0.05


def test_patrol_point_none_when_no_space():
    grid = np.full((10, 10), 100, dtype=np.int8)
    assert pick_patrol_point(grid, 0.05, (0.0, 0.0), (0.2, 0.2), np.random.default_rng(0)) is None


def test_geometry_round_trips():
    for yaw in (-3.0, -1.0, 0.0, 0.7, 3.1):
        assert abs(wrap(yaw_from_quat(*quat_from_yaw(yaw)) - yaw)) < 1e-9
    x, y = to_local(1.0, 1.0, 1.0, 0.0, math.pi / 2)
    assert abs(x - 1.0) < 1e-9 and abs(y) < 1e-9
