"""Render a contact sheet of Pip's eyes for every mood: python scripts/render_eyes.py [out.png].

Works without ROS (and without a screen) so you can tweak eye shapes on any computer.
"""

import os
import sys

os.environ.setdefault('SDL_VIDEODRIVER', 'dummy')
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src', 'pip_personality'))

import pygame  # noqa: E402

from pip_personality.eyes_render import EyeRenderer  # noqa: E402
from pip_personality.mood import MOODS  # noqa: E402

TILE_W, TILE_H, COLS = 540, 300, 3


def main(out: str) -> None:
    pygame.init()
    pygame.display.set_mode((1, 1))
    rows = -(-len(MOODS) // COLS)
    sheet = pygame.Surface((TILE_W * COLS, TILE_H * rows))
    sheet.fill((22, 22, 28))
    for i, mood in enumerate(MOODS):
        renderer = EyeRenderer(seed=1)
        renderer.next_blink = 1e9  # eyes open for the picture
        renderer.next_saccade = 1e9
        for _ in range(60):  # let the shape settle
            renderer.update(1 / 30, mood, 0.0)
        tile = pygame.Surface((TILE_W, TILE_H))
        renderer.draw(tile, mood)
        sheet.blit(tile, ((i % COLS) * TILE_W, (i // COLS) * TILE_H))
    pygame.image.save(sheet, out)
    print(f'wrote {out}')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'docs/eyes.png')
