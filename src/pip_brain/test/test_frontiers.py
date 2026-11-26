import numpy as np

from pip_brain.frontiers import (choose_frontier, find_frontiers, frontier_mask, still_frontier,
                                 UNKNOWN)


def room_with_unknown_right_half():
    """20x20 cells: walls around a free left half, the right half unknown."""
    grid = np.full((20, 20), UNKNOWN, dtype=np.int8)
    grid[:, :10] = 0
    grid[0, :10] = 100
    grid[-1, :10] = 100
    grid[:, 0] = 100
    return grid


def test_frontier_mask_marks_free_cells_next_to_unknown():
    grid = room_with_unknown_right_half()
    mask = frontier_mask(grid)
    assert mask[5, 9]  # free, right next to unknown column 10
    assert not mask[5, 8]  # free but surrounded by free/known cells
    assert not mask[0, 9]  # occupied wall cell is never a frontier


def test_find_frontiers_groups_one_edge():
    grid = room_with_unknown_right_half()
    frontiers = find_frontiers(grid, resolution=0.1, origin=(0.0, 0.0), min_size=3)
    assert len(frontiers) == 1
    f = frontiers[0]
    assert f.size == 18  # rows 1..18 of column 9
    assert abs(f.goal[0] - 0.95) < 1e-9  # column 9 centre
    assert 0.8 < f.goal[1] < 1.2


def test_small_frontiers_are_ignored():
    grid = np.zeros((10, 10), dtype=np.int8)
    grid[5, 5] = UNKNOWN  # a single unknown speck
    assert find_frontiers(grid, 0.05, (0.0, 0.0), min_size=8) == []


def test_choose_frontier_skips_blacklisted_and_prefers_close():
    grid = np.full((30, 60), UNKNOWN, dtype=np.int8)
    grid[10:20, 5:15] = 0  # left pocket
    grid[10:20, 45:55] = 0  # right pocket
    frontiers = find_frontiers(grid, 0.1, (0.0, 0.0), min_size=3)
    assert len(frontiers) == 2
    robot = (1.0, 1.5)
    best = choose_frontier(frontiers, robot, 0.1, blacklist=[])
    assert best.goal[0] < 3.0  # the left pocket is closer
    best = choose_frontier(frontiers, robot, 0.1, blacklist=[best.goal], blacklist_radius=1.0)
    assert best.goal[0] > 3.0


def test_still_frontier():
    grid = room_with_unknown_right_half()
    assert still_frontier(grid, 0.1, (0.0, 0.0), (0.95, 1.0))
    grid[:, 10:] = 0  # the unknown half got mapped
    assert not still_frontier(grid, 0.1, (0.0, 0.0), (0.95, 1.0))
