"""Frontier detection for autonomous exploration.

A frontier cell is a known-free cell that touches unknown space. Adjacent frontier cells are
grouped into frontiers; Pip drives to one, the lidar reveals what is behind it, and the map grows
until no reachable frontiers are left.
"""

from collections import deque
from dataclasses import dataclass
import math

import numpy as np

UNKNOWN = -1
FREE_MAX = 25  # occupancy values 0..FREE_MAX count as free


@dataclass(frozen=True)
class Frontier:
    size: int  # number of cells
    centroid: tuple[float, float]  # world coordinates [m]
    goal: tuple[float, float]  # the frontier cell nearest the centroid, in world coordinates


def grid_from_msg(data, width: int, height: int) -> np.ndarray:
    """OccupancyGrid data (row-major, row = y) -> (height, width) int8 array."""
    return np.asarray(data, dtype=np.int8).reshape(height, width)


def frontier_mask(grid: np.ndarray) -> np.ndarray:
    free = (grid >= 0) & (grid <= FREE_MAX)
    unknown = grid == UNKNOWN
    touches_unknown = np.zeros_like(unknown)
    touches_unknown[1:, :] |= unknown[:-1, :]
    touches_unknown[:-1, :] |= unknown[1:, :]
    touches_unknown[:, 1:] |= unknown[:, :-1]
    touches_unknown[:, :-1] |= unknown[:, 1:]
    return free & touches_unknown


def find_frontiers(grid: np.ndarray, resolution: float, origin: tuple[float, float],
                   min_size: int = 8) -> list[Frontier]:
    mask = frontier_mask(grid)
    visited = np.zeros_like(mask)
    height, width = grid.shape
    frontiers = []

    def to_world(rc) -> tuple[float, float]:
        return (origin[0] + (rc[1] + 0.5) * resolution, origin[1] + (rc[0] + 0.5) * resolution)

    for r, c in zip(*np.nonzero(mask)):
        if visited[r, c]:
            continue
        visited[r, c] = True
        queue = deque([(r, c)])
        cells = []
        while queue:
            cr, cc = queue.popleft()
            cells.append((cr, cc))
            for dr in (-1, 0, 1):
                for dc in (-1, 0, 1):
                    nr, nc = cr + dr, cc + dc
                    if 0 <= nr < height and 0 <= nc < width and mask[nr, nc] and not visited[nr, nc]:
                        visited[nr, nc] = True
                        queue.append((nr, nc))
        if len(cells) < min_size:
            continue
        arr = np.asarray(cells, dtype=float)
        centroid = arr.mean(axis=0)
        nearest = arr[np.argmin(((arr - centroid) ** 2).sum(axis=1))]
        frontiers.append(Frontier(len(cells), to_world(centroid), to_world(nearest)))
    return frontiers


def choose_frontier(frontiers: list[Frontier], robot_xy: tuple[float, float], resolution: float,
                    blacklist: list[tuple[float, float]], blacklist_radius: float = 0.5,
                    min_distance: float = 0.3, size_weight: float = 1.0) -> Frontier | None:
    """Prefer big frontiers that are close. Skips blacklisted goals and ones Pip is already on."""
    best, best_score = None, math.inf
    for f in frontiers:
        if any(math.dist(f.goal, b) < blacklist_radius for b in blacklist):
            continue
        distance = math.dist(f.goal, robot_xy)
        if distance < min_distance:
            continue
        score = distance - size_weight * f.size * resolution
        if score < best_score:
            best, best_score = f, score
    return best


def still_frontier(grid: np.ndarray, resolution: float, origin: tuple[float, float],
                   xy: tuple[float, float], radius: float = 0.15) -> bool:
    """Is there still unknown space right next to this goal?"""
    col = int((xy[0] - origin[0]) / resolution)
    row = int((xy[1] - origin[1]) / resolution)
    k = max(1, int(radius / resolution))
    r0, r1 = max(0, row - k), min(grid.shape[0], row + k + 1)
    c0, c1 = max(0, col - k), min(grid.shape[1], col + k + 1)
    if r0 >= r1 or c0 >= c1:
        return False
    return bool((grid[r0:r1, c0:c1] == UNKNOWN).any())
