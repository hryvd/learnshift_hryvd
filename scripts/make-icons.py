"""Draws the LearnShift app icons using Paty's pixel-art sprite at every size the app needs."""
from __future__ import annotations

import copy
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
PATY_DIR = ROOT / 'design' / 'paty'

BG = '#FDF1E2'
WHITE = '#FFFFFF'


def hex_rgba(h: str, a: int = 255) -> tuple[int, int, int, int]:
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def load_paty_grids():
    ns: dict = {}
    exec((PATY_DIR / 'base.py').read_text(encoding='utf-8'), ns)
    w, h = ns['W'], ns['H']
    pal: dict[str, str] = dict(ns['PAL'])
    pal['M'] = '#7A3B24'
    base = copy.deepcopy(ns['g'])

    def outline(grid, protect=None):
        gh, gw = len(grid), len(grid[0])
        filled = [[grid[y][x] != '.' for x in range(gw)] for y in range(gh)]
        out = [row[:] for row in grid]
        for y in range(gh):
            for x in range(gw):
                if filled[y][x]:
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < gw and 0 <= ny < gh and filled[ny][nx]:
                        if protect is None or not protect(x, y):
                            out[y][x] = 'K'
                        break
        return out

    def body(no_left: bool = False):
        b = copy.deepcopy(base)
        for y in range(34, 39):
            if no_left:
                for x in (8, 9, 10):
                    b[y][x] = '.'
                b[y][11] = 'v'
            else:
                b[y][11] = 'K'
            b[y][24] = 'K'
        return outline(b)

    full = body(no_left=False)
    nol = body(no_left=True)

    ox, lw = -8, w + 16

    def seg_d(px, py, ax, ay, bx, by):
        vx, vy = bx - ax, by - ay
        t = max(0, min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)))
        return ((px - ax - t * vx) ** 2 + (py - ay - t * vy) ** 2) ** 0.5

    def arm_wave_a():
        grid = [['.'] * lw for _ in range(h)]
        for y in range(h):
            for x in range(ox, ox + lw):
                if seg_d(x + 0.5, y + 0.5, 9.5, 31, 3.5, 25.5) <= 1.45:
                    grid[y][x - ox] = 'S'
                if ((x + 0.5 - 1.6) / 2.5) ** 2 + ((y + 0.5 - 22.6) / 2.9) ** 2 <= 1:
                    grid[y][x - ox] = 'S'
        for cx, cy in [(8, 30), (9, 30), (10, 30), (8, 31), (9, 31), (10, 31), (8, 32), (9, 32), (10, 32)]:
            grid[cy][cx - ox] = 'w'

        def protect(gx, gy):
            bx = gx + ox
            return 0 <= bx < w and nol[gy][bx] in 'wvRrY'

        return outline(grid, protect)

    wave_a = arm_wave_a()

    # Composite full waving sprite into 50x50 viewBox (x=-7..42, y=-1..48).
    wave_img = Image.new('RGBA', (50, 50), (0, 0, 0, 0))
    wpx = wave_img.load()
    for y in range(h):
        for x in range(w):
            ch = nol[y][x]
            if ch != '.':
                wpx[x + 7, y + 1] = hex_rgba(pal[ch])
    for y in range(h):
        for gx in range(lw):
            ch = wave_a[y][gx]
            x = gx + ox
            if ch != '.' and -7 <= x < 43:
                wpx[x + 7, y + 1] = hex_rgba(pal[ch])

    # Bust crop: 32x32 viewBox (x=2..33, y=0..31).
    bust_img = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
    bpx = bust_img.load()
    for y in range(32):
        for x in range(2, 34):
            ch = full[y][x]
            if ch != '.':
                bpx[x - 2, y] = hex_rgba(pal[ch])

    # Happy eyes + smile on both sprites.
    def draw_face_details(px_buf, x_off: int, y_off: int):
        for ex in (11, 22):
            for dy in range(4):
                for dx in range(3):
                    col = WHITE if (dx == 0 and dy == 0) else pal['K']
                    px_buf[ex + dx + x_off, 18 + dy + y_off] = hex_rgba(col)
        for mx, my in [(16, 25), (17, 26), (18, 26), (19, 26), (20, 25)]:
            px_buf[mx + x_off, my + y_off] = hex_rgba(pal['M'])

    draw_face_details(wpx, 7, 1)
    draw_face_details(bpx, -2, 0)

    # Monochrome silhouette (32x32 bust): solid white with transparent lens interiors & 2x2 pupils.
    mono_img = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
    mpx = mono_img.load()
    for y in range(32):
        for x in range(2, 34):
            if full[y][x] == '.':
                continue
            in_left_lens = ((x + 0.5 - 12.5) ** 2 + (y + 0.5 - 19.0) ** 2) ** 0.5 < 3.6
            in_right_lens = ((x + 0.5 - 23.5) ** 2 + (y + 0.5 - 19.0) ** 2) ** 0.5 < 3.6
            if in_left_lens or in_right_lens:
                continue
            mpx[x - 2, y] = (255, 255, 255, 255)
    for px0, py0 in [(12, 18), (22, 18)]:
        for dy in (0, 1):
            for dx in (0, 1):
                mpx[px0 + dx - 2, py0 + dy] = (255, 255, 255, 255)

    return bust_img, wave_img, mono_img


def stamp_centered(canvas_size: int, sprite: Image.Image, target_px: int, bg=None) -> Image.Image:
    im = Image.new('RGBA', (canvas_size, canvas_size), hex_rgba(bg) if isinstance(bg, str) else (bg or (0, 0, 0, 0)))
    scaled = sprite.resize((target_px, target_px), Image.NEAREST)
    off = (canvas_size - target_px) // 2
    im.alpha_composite(scaled, (off, off))
    return im


def mask_rounded(im: Image.Image, radius: int) -> Image.Image:
    mask = Image.new('L', im.size, 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, im.size[0] - 1, im.size[1] - 1], radius=radius, fill=255)
    out = Image.new('RGBA', im.size, (0, 0, 0, 0))
    out.paste(im, (0, 0), mask)
    return out


def mask_circle(im: Image.Image) -> Image.Image:
    mask = Image.new('L', im.size, 0)
    d = ImageDraw.Draw(mask)
    d.ellipse([0, 0, im.size[0] - 1, im.size[1] - 1], fill=255)
    out = Image.new('RGBA', im.size, (0, 0, 0, 0))
    out.paste(im, (0, 0), mask)
    return out


def main():
    bust, wave, mono = load_paty_grids()
    assets = ROOT / 'assets' / 'images'

    stamp_centered(1024, bust, 832, bg=BG).save(assets / 'icon.png')
    stamp_centered(512, bust, 320).save(assets / 'android-icon-foreground.png')
    Image.new('RGBA', (512, 512), hex_rgba(BG)).save(assets / 'android-icon-background.png')
    stamp_centered(512, mono, 320).save(assets / 'android-icon-monochrome.png')
    stamp_centered(512, wave, 450).save(assets / 'splash-icon.png')
    stamp_centered(96, mono, 80).save(assets / 'notification-icon.png')
    stamp_centered(256, bust, 224, bg=BG).save(assets / 'favicon.png')

    android_res = ROOT / 'android' / 'app' / 'src' / 'main' / 'res'
    if android_res.exists():
        for folder, launcher_px, adaptive_px in [
            ('mipmap-mdpi', 48, 108),
            ('mipmap-hdpi', 72, 162),
            ('mipmap-xhdpi', 96, 216),
            ('mipmap-xxhdpi', 144, 324),
            ('mipmap-xxxhdpi', 192, 432),
        ]:
            d = android_res / folder
            d.mkdir(parents=True, exist_ok=True)
            sq = stamp_centered(launcher_px, bust, round(launcher_px * 0.82), bg=BG)
            mask_rounded(sq, launcher_px // 5).save(d / 'ic_launcher.webp', format='WEBP', lossless=True)
            rd = stamp_centered(launcher_px, bust, round(launcher_px * 0.80), bg=BG)
            mask_circle(rd).save(d / 'ic_launcher_round.webp', format='WEBP', lossless=True)
            stamp_centered(adaptive_px, bust, round(adaptive_px * 0.62)).save(
                d / 'ic_launcher_foreground.webp', format='WEBP', lossless=True
            )
            Image.new('RGBA', (adaptive_px, adaptive_px), hex_rgba(BG)).save(
                d / 'ic_launcher_background.webp', format='WEBP', lossless=True
            )
            stamp_centered(adaptive_px, mono, round(adaptive_px * 0.62)).save(
                d / 'ic_launcher_monochrome.webp', format='WEBP', lossless=True
            )

        for folder, notif_px, splash_px in [
            ('drawable-mdpi', 24, 288),
            ('drawable-hdpi', 36, 432),
            ('drawable-xhdpi', 48, 576),
            ('drawable-xxhdpi', 72, 864),
            ('drawable-xxxhdpi', 96, 1152),
        ]:
            d = android_res / folder
            d.mkdir(parents=True, exist_ok=True)
            stamp_centered(notif_px, mono, round(notif_px * 0.84)).save(d / 'notification_icon.png')
            stamp_centered(splash_px, wave, round(splash_px * 0.86)).save(d / 'splashscreen_logo.png')

    print('Paty icons written to assets/images and android/app/src/main/res')


if __name__ == '__main__':
    main()
