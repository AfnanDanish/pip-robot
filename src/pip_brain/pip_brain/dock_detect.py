"""Find the charging dock's flat front face in a lidar scan and steer onto it.

The dock is a 0.30 m wide flat face standing out from the wall. We know roughly where it should be
(from the map), so we look only in a small window around that spot, fit a line with RANSAC (so the
wall corners next to the dock don't pull the fit), and check the width matches the dock.
"""

from dataclasses import dataclass
import math

import numpy as np


@dataclass(frozen=True)
class DockObservation:
    center: tuple[float, float]  # face centre in the sensor frame [m]
    normal: tuple[float, float]  # unit normal pointing from the face towards the sensor
    width: float  # visible face width [m]
    rms: float  # line-fit residual [m]
    points: int


@dataclass(frozen=True)
class Approach:
    v: float  # forward speed command [m/s]
    w: float  # turn rate command [rad/s]
    dist: float  # distance from the robot centre to the face plane [m]
    lateral: float  # how far the dock's centre line is to the robot's left [m]
    heading_err: float  # angle between robot heading and straight into the dock [rad]


def scan_points(ranges, angle_min: float, angle_increment: float,
                range_min: float, range_max: float) -> np.ndarray:
    r = np.asarray(ranges, dtype=float)
    a = angle_min + np.arange(len(r)) * angle_increment
    ok = np.isfinite(r) & (r > range_min) & (r < range_max)
    return np.column_stack((r[ok] * np.cos(a[ok]), r[ok] * np.sin(a[ok])))


def _ransac_line(points: np.ndarray, threshold: float, iterations: int, rng) -> np.ndarray:
    best = np.zeros(len(points), dtype=bool)
    for _ in range(iterations):
        i, j = rng.choice(len(points), size=2, replace=False)
        d = points[j] - points[i]
        norm = math.hypot(d[0], d[1])
        if norm < 1e-6:
            continue
        n = np.array([-d[1], d[0]]) / norm
        inliers = np.abs((points - points[i]) @ n) < threshold
        if inliers.sum() > best.sum():
            best = inliers
    return best


def fit_dock_face(points: np.ndarray, expected: tuple[float, float], window: float = 0.25,
                  expected_width: float = 0.30, width_tol: float = 0.12, max_rms: float = 0.015,
                  min_points: int = 6, seed: int = 0) -> DockObservation | None:
    if len(points) == 0:
        return None
    near = points[np.linalg.norm(points - np.asarray(expected), axis=1) < window]
    if len(near) < min_points:
        return None
    inliers = _ransac_line(near, threshold=0.012, iterations=60, rng=np.random.default_rng(seed))
    face = near[inliers]
    if len(face) < min_points:
        return None

    mean = face.mean(axis=0)
    _, s, vt = np.linalg.svd(face - mean)
    direction, normal = vt[0], vt[1]
    rms = float(s[1] / math.sqrt(len(face)))
    along = (face - mean) @ direction
    width = float(along.max() - along.min())
    if rms > max_rms or abs(width - expected_width) > width_tol:
        return None

    center = mean + direction * (along.max() + along.min()) / 2.0
    if normal @ (-center) < 0:  # make the normal point back at the sensor
        normal = -normal
    return DockObservation((float(center[0]), float(center[1])),
                           (float(normal[0]), float(normal[1])), width, rms, len(face))


def approach_command(obs: DockObservation, stop_dist: float, lookahead: float = 0.25,
                     k_turn: float = 1.6, v_max: float = 0.10, v_min: float = 0.03,
                     w_max: float = 0.8) -> Approach:
    """Steer towards a carrot point on the dock's centre line, closer to the face each step."""
    c = np.asarray(obs.center)
    n = np.asarray(obs.normal)
    t = np.array([-n[1], n[0]])
    dist = float(-n @ c)
    lateral = float(-t @ c)
    heading_err = math.atan2(-n[1], -n[0])

    carrot = c + n * max(dist - lookahead, stop_dist)
    bearing = math.atan2(carrot[1], carrot[0])
    w = max(-w_max, min(w_max, k_turn * bearing))
    v = max(v_min, min(v_max, 0.5 * (dist - stop_dist))) * max(0.0, math.cos(bearing))
    return Approach(v, w, dist, lateral, heading_err)
