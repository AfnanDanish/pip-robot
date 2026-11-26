"""Pick places for Pip to wander to once the home is mapped."""

import math

import numpy as np

from .frontiers import FREE_MAX


def erode(mask: np.ndarray, k: int) -> np.ndarray:
    """Keep only cells whose whole disc of radius k cells is inside the mask."""
    if k <= 0:
        return mask.copy()
    height, width = mask.shape
    padded = np.pad(mask, k, constant_values=False)
    out = mask.copy()
    for dr in range(-k, k + 1):
        for dc in range(-k, k + 1):
            if dr * dr + dc * dc > k * k:
                continue
            out &= padded[k + dr:k + dr + height, k + dc:k + dc + width]
    return out


def pick_patrol_point(grid: np.ndarray, resolution: float, origin: tuple[float, float],
                      robot_xy: tuple[float, float], rng: np.random.Generator,
                      clearance: float = 0.30, min_distance: float = 1.5) -> tuple[float, float] | None:
    free = (grid >= 0) & (grid <= FREE_MAX)
    safe = erode(free, int(math.ceil(clearance / resolution)))
    rows, cols = np.nonzero(safe)
    if len(rows) == 0:
        return None
    xs = origin[0] + (cols + 0.5) * resolution
    ys = origin[1] + (rows + 0.5) * resolution
    far = np.hypot(xs - robot_xy[0], ys - robot_xy[1]) >= min_distance
    if not far.any():
        return None
    i = rng.choice(np.flatnonzero(far))
    return float(xs[i]), float(ys[i])
