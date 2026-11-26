"""Draws Pip's eyes with pygame.

Each eye is drawn on its own 240x240 surface, the resolution of the GC9A01 round displays the
real robot uses, so the same frames can later be pushed over SPI to the hardware screens.
"""

import math
import random

import pygame

from .eyes_params import EyeParams, lerp_params, target_for_mood

DISPLAY = 240
EYE_COLOR = (90, 225, 255)
EYE_EDGE = (40, 140, 190)
SPARKLE = (235, 252, 255)
BACKGROUND = (0, 0, 0)
BEZEL = (52, 52, 60)
WINDOW_BG = (22, 22, 28)


class EyeRenderer:
    def __init__(self, seed: int | None = None):
        self.rng = random.Random(seed)
        self.params = target_for_mood('neutral')
        self.t = 0.0
        self.blink_start = -1.0
        self.next_blink = 2.0
        self.look_x = 0.0
        self.saccade = (0.0, 0.0)
        self.next_saccade = 1.0
        self._mask = pygame.Surface((DISPLAY, DISPLAY), pygame.SRCALPHA)
        self._mask.fill((0, 0, 0, 0))
        pygame.draw.circle(self._mask, (255, 255, 255, 255), (DISPLAY // 2, DISPLAY // 2), DISPLAY // 2)

    def update(self, dt: float, mood: str, turn_rate: float) -> None:
        self.t += dt
        self.params = lerp_params(self.params, target_for_mood(mood), dt * 8.0)

        if self.t >= self.next_blink:
            self.blink_start = self.t
            self.next_blink = self.t + self.rng.uniform(2.5, 6.0)
            if self.rng.random() < 0.15:  # occasional double blink
                self.next_blink = self.t + 0.35
        if self.t >= self.next_saccade:
            self.saccade = (self.rng.uniform(-18, 18), self.rng.uniform(-8, 8))
            self.next_saccade = self.t + self.rng.uniform(0.8, 3.0)

        target_x = max(-40.0, min(40.0, -turn_rate * 30.0)) + self.saccade[0]
        self.look_x += (target_x - self.look_x) * min(1.0, dt * 10.0)

    def blink_factor(self) -> float:
        dt = self.t - self.blink_start
        if dt < 0 or dt > 0.16:
            return 1.0
        return abs(dt - 0.08) / 0.08  # 1 -> 0 -> 1 over 160 ms

    def draw(self, screen: pygame.Surface, caption: str = '') -> None:
        screen.fill(WINDOW_BG)
        gap = 30
        total = 2 * DISPLAY + gap
        x0 = (screen.get_width() - total) // 2
        y0 = 20
        for i, side in enumerate(('left', 'right')):
            surf = pygame.Surface((DISPLAY, DISPLAY), pygame.SRCALPHA)
            surf.fill((*BACKGROUND, 255))
            self._draw_eye(surf, side)
            surf.blit(self._mask, (0, 0), special_flags=pygame.BLEND_RGBA_MULT)
            pos = (x0 + i * (DISPLAY + gap), y0)
            pygame.draw.circle(screen, BEZEL, (pos[0] + DISPLAY // 2, pos[1] + DISPLAY // 2),
                               DISPLAY // 2 + 8)
            screen.blit(surf, pos)
        if caption:
            font = pygame.font.Font(None, 26)
            text = font.render(caption, True, (170, 170, 180))
            screen.blit(text, ((screen.get_width() - text.get_width()) // 2, y0 + DISPLAY + 22))

    def _draw_eye(self, surf: pygame.Surface, side: str) -> None:
        p: EyeParams = self.params
        scale = 1.0 + (p.asym if side == 'right' else -p.asym * 0.5)
        w = 112 * p.width * scale
        h = max(6.0, 150 * p.open * scale * self.blink_factor())
        cx = DISPLAY / 2 + self.look_x
        cy = DISPLAY / 2 + self.saccade[1] + p.look_y * 30
        rect = pygame.Rect(0, 0, int(w), int(h))
        rect.center = (int(cx), int(cy))
        radius = int(min(w, h) * 0.38)

        outer = rect.inflate(8, 8)
        pygame.draw.rect(surf, EYE_EDGE, outer, border_radius=radius + 4)
        pygame.draw.rect(surf, EYE_COLOR, rect, border_radius=radius)

        # Slanted upper lid: inner corner is the side facing the other eye.
        if abs(p.slant) > 0.01:
            drop = abs(p.slant) * h * 0.55
            # Angry: inner corners drop. Sad: outer corners drop.
            inner_drop, outer_drop = (drop, 0.0) if p.slant > 0 else (0.0, drop)
            left_drop, right_drop = ((outer_drop, inner_drop) if side == 'left'
                                     else (inner_drop, outer_drop))
            top = outer.top - 2
            lid = [(outer.left - 4, top - 60), (outer.right + 4, top - 60),
                   (outer.right + 4, top + max(0, right_drop)),
                   (outer.left - 4, top + max(0, left_drop))]
            pygame.draw.polygon(surf, BACKGROUND, lid)

        # Happy lower lid: a background ellipse pushing up from below makes a ^ ^ arc.
        if p.smile > 0.02:
            ew, eh = w * 1.6, h * 1.1
            lid = pygame.Rect(0, 0, int(ew), int(eh))
            lid.midtop = (rect.centerx, int(rect.bottom - p.smile * h * 0.55))
            pygame.draw.ellipse(surf, BACKGROUND, lid)

        if p.sparkle > 0.05:
            phase = 0.5 + 0.5 * math.sin(self.t * 6.0 + (0 if side == 'left' else 1.7))
            r = int(4 + 6 * p.sparkle * phase)
            pygame.draw.circle(surf, SPARKLE, (rect.left + int(w * 0.28), rect.top + int(h * 0.25)), r)
            pygame.draw.circle(surf, SPARKLE, (rect.left + int(w * 0.45), rect.top + int(h * 0.42)),
                               max(2, r // 2))
