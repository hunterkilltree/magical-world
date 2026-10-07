#!/usr/bin/env python3
"""Generates placeholder art for the element-queue UI (replace with real textures later):

  ui/background_frame.png   heavy stone bar
  ui/slot_frame.png         circular metal slot frame
  ui/elements/<name>.png    one icon per element

Run from the project root: python3 tools/make_ui_placeholders.py
"""
import math
import os
import random

from PIL import Image, ImageChops, ImageDraw, ImageFilter

SS = 4  # supersampling factor for smooth edges

ELEMENTS = {
    "fire": "#f97316", "water": "#06b6d4", "earth": "#a16207", "nature": "#22c55e",
    "lightning": "#eab308", "ice": "#38bdf8", "wind": "#14b8a6", "light": "#fbbf24", "dark": "#6b21a8",
}


def rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def shade(c, f):
    return tuple(max(0, min(255, int(v * f))) for v in c)


def finish(img, size):
    return img.resize(size, Image.LANCZOS)


def background_frame(path, w=420, h=96):
    W, H = w * SS, h * SS
    rnd = random.Random(7)
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    base = Image.new("RGBA", (W, H), (58, 54, 50, 255))
    px = base.load()
    for y in range(0, H, 2):  # stone speckle
        for x in range(0, W, 2):
            n = rnd.randint(-14, 14)
            r, g, b, _ = px[x, y]
            px[x, y] = (r + n, g + n, b + n, 255)
    base = base.filter(ImageFilter.GaussianBlur(SS * 0.6))
    d = ImageDraw.Draw(base)
    for i in range(7):  # mortar lines
        x = int(W * (i + 1) / 8 + rnd.randint(-8, 8) * SS)
        d.line([(x, 0), (x, H)], fill=(30, 28, 26, 255), width=SS)
    d.line([(0, H // 2), (W, H // 2)], fill=(30, 28, 26, 255), width=SS)
    mask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, W - 1, H - 1], radius=14 * SS, fill=255)
    img.paste(base, (0, 0), mask)
    d = ImageDraw.Draw(img)
    r = 14 * SS
    d.rounded_rectangle([SS, SS, W - SS, H - SS], radius=r, outline=(132, 124, 112, 255), width=3 * SS)  # lit rim
    d.rounded_rectangle([5 * SS, 5 * SS, W - 5 * SS, H - 5 * SS], radius=r - 4 * SS, outline=(24, 22, 20, 255), width=2 * SS)
    for cx in (12 * SS, W - 12 * SS):  # rivets
        for cy in (12 * SS, H - 12 * SS):
            d.ellipse([cx - 4 * SS, cy - 4 * SS, cx + 4 * SS, cy + 4 * SS], fill=(150, 140, 120, 255), outline=(30, 28, 26, 255), width=SS)
    finish(img, (w, h)).save(path)


def slot_frame(path, s=72):
    S = s * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c = S / 2
    d.ellipse([SS, SS, S - SS, S - SS], fill=(8, 8, 12, 170))  # dark well
    for i in range(40):  # metallic ring with a lit upper-left
        t = i / 39.0
        v = int(95 + 110 * (1 - t))
        inset = (2 + 5 * t) * SS
        d.ellipse([inset, inset, S - inset, S - inset], outline=(v, int(v * 0.93), int(v * 0.8), 255), width=SS)
    d.ellipse([9 * SS, 9 * SS, S - 9 * SS, S - 9 * SS], outline=(10, 10, 14, 255), width=2 * SS)
    finish(img, (s, s)).save(path)


def glyph(d, name, cx, cy, r, col):
    if name == "fire":
        d.polygon([(cx, cy - r), (cx + r * .75, cy + r * .55), (cx, cy + r * .9), (cx - r * .75, cy + r * .55)], fill=col)
    elif name == "water":
        d.polygon([(cx, cy - r), (cx + r * .7, cy + r * .2), (cx - r * .7, cy + r * .2)], fill=col)
        d.ellipse([cx - r * .7, cy - r * .2, cx + r * .7, cy + r], fill=col)
    elif name == "earth":
        d.rectangle([cx - r * .7, cy - r * .7, cx + r * .7, cy + r * .7], fill=col)
    elif name == "nature":
        for dx, dy in ((0, -.45), (-.5, .35), (.5, .35)):
            d.ellipse([cx + dx * r - r * .5, cy + dy * r - r * .5, cx + dx * r + r * .5, cy + dy * r + r * .5], fill=col)
    elif name == "lightning":
        d.polygon([(cx + r * .2, cy - r), (cx - r * .6, cy + r * .1), (cx, cy + r * .1), (cx - r * .2, cy + r), (cx + r * .6, cy - r * .15), (cx, cy - r * .15)], fill=col)
    elif name == "ice":
        d.polygon([(cx, cy - r), (cx + r * .6, cy), (cx, cy + r), (cx - r * .6, cy)], fill=col)
    elif name == "wind":
        for k in (-.5, 0, .5):
            d.arc([cx - r, cy + k * r - r * .5, cx + r, cy + k * r + r * .5], 200, 340, fill=col, width=int(r * .22))
    elif name == "light":
        pts = []
        for i in range(16):
            a = math.pi * i / 8
            rr = r if i % 2 == 0 else r * .42
            pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
        d.polygon(pts, fill=col)
    elif name == "dark":
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=col)


def element_icon(path, name, color, s=64):
    S = s * SS
    col = rgb(color)
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    c = S / 2
    orb = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    od = ImageDraw.Draw(orb)
    R = S / 2 - 3 * SS
    for i in range(30):  # radial gradient, light centre up-left
        t = i / 29.0
        r = R * (1 - t)
        f = 0.55 + 0.7 * t
        ox, oy = -R * .25 * t, -R * .3 * t
        od.ellipse([c + ox - r, c + oy - r, c + ox + r, c + oy + r], fill=shade(col, f) + (255,))
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).ellipse([c - R, c - R, c + R, c + R], fill=255)
    img.paste(orb, (0, 0), mask)
    d = ImageDraw.Draw(img)
    d.ellipse([c - R, c - R, c + R, c + R], outline=shade(col, 0.35) + (255,), width=2 * SS)
    glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    d2 = ImageDraw.Draw(img)
    glyph(d2, name, c, c + SS, R * .5, (255, 255, 255, 235) if name != "dark" else (230, 200, 255, 255))
    if name == "dark":  # crescent: cut a circle out of the glyph
        cut = Image.new("L", (S, S), 0)
        ImageDraw.Draw(cut).ellipse([c - R * .15, c - R * .55 + SS, c + R * .85, c + R * .45 + SS], fill=255)
        orb2 = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        img_alpha = img.copy()
        base_only = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        base_only.paste(orb, (0, 0), mask)
        img = Image.composite(base_only, img, cut)
        ImageDraw.Draw(img).ellipse([c - R, c - R, c + R, c + R], outline=shade(col, 0.35) + (255,), width=2 * SS)
    d3 = ImageDraw.Draw(img)
    d3.ellipse([c - R * .55, c - R * .8, c - R * .05, c - R * .42], fill=(255, 255, 255, 70))  # glassy highlight
    finish(img, (s, s)).save(path)


if __name__ == "__main__":
    os.makedirs("ui/elements", exist_ok=True)
    background_frame("ui/background_frame.png")
    slot_frame("ui/slot_frame.png")
    for n, c in ELEMENTS.items():
        element_icon(f"ui/elements/{n}.png", n, c)
    print("wrote ui/background_frame.png, ui/slot_frame.png and", len(ELEMENTS), "element icons")
