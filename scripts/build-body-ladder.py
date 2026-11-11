#!/usr/bin/env python3
"""Build Crid's body ladder from the seven drawings that already ship.

WHERE THE SEVEN FRAMES COME FROM (established before this script existed)
------------------------------------------------------------------------
fetch-crid-views.mjs asks preview.bitmoji.com/bm-preview/v3/avatar/body with the owner's own avatar
parameters and varies only two of them: `body=` (the shape the Bitmoji editor offers) and
`rotation=` (viewing angle). It asks at scale=3 first, falls back to scale=1, and writes
views/shape-<body>.png and views/angle-<rotation>.png — 1050x1400 PNGs, rotation 0 for the shapes.

The seven frames in public/desk-assets/crid/ were cut from those renders to 600x800 webp at
rotation 7 (hence the -r7 in every filename), with the ink ~688px tall, the feet near y=757 and the
body centre on x=320, then exported as webp to keep the payload small. views/ holds the masters for
body 0, 1, 2, 3 and 5. body-000 and body-00 have no master in views/: the owner drew those two
himself and they were committed straight as webp.

So there are five distinct masters, not seven, and three of them measure within 2px of each other:
the art alone cannot carry a body ladder. This script builds one from that art without drawing
anything — it crops the ink out of each shipped frame, resizes it to the stage's height, and warps
it horizontally with a smooth width profile so the torso carries the weight while the head keeps
its own proportions. Every stage is still the owner's own Bitmoji.

Framing is preserved exactly as the renderer assumes (crid-bot.js: INK_BOTTOM, FIG_X, FIG_W):
  canvas 600x800, ink bottom on y=757, torso axis on x=320.
A body swap therefore never moves his feet and never shifts him sideways.

Needs Pillow (not a runtime dependency — this is a one-off asset tool):
  python3 -m pip install pillow

  python3 scripts/build-body-ladder.py            # rebuild the seven frames + ladder.json
  python3 scripts/build-body-ladder.py --measure  # print the ink box of every shipped frame
  python3 scripts/build-body-ladder.py --sheet OUT.png   # side-by-side sheet at real desk size
"""
import json
import math
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
CRID = ROOT / "public" / "desk-assets" / "crid"
LADDER_JSON = CRID / "ladder.json"

FRAME_W, FRAME_H = 600, 800
GROUND = 757          # ink bottom, the y crid-bot.js maps onto the floor line
AXIS = 320            # torso axis, the x crid-bot.js maps onto the sprite centre
ALPHA_MIN = 8

# key, target ink height, target ink width, torso width bias (+fatter/-leaner), head damping
STAGES = [
    ("000", 660, 176, -0.10, 0.00),
    ("00", 672, 208, -0.04, 0.00),
    ("3", 684, 240, 0.02, 0.00),
    ("0", 700, 278, 0.10, 0.00),
    ("5", 716, 320, 0.20, 0.04),
    ("1", 734, 386, 0.28, 0.08),
    ("2", 752, 470, 0.36, 0.12),
]


# --- measuring -----------------------------------------------------------------------------
def alpha_bbox(im):
    a = im.getchannel("A").point(lambda v: 255 if v > ALPHA_MIN else 0)
    return a.getbbox()


def row_spans(im):
    """Per-row ink span on the alpha channel — the shape of the drawing, row by row."""
    a = im.getchannel("A").load()
    w, h = im.size
    spans = []
    for y in range(h):
        lo = hi = None
        for x in range(w):
            if a[x, y] > ALPHA_MIN:
                if lo is None:
                    lo = x
                hi = x
        spans.append((lo, hi))
    return spans


def ink(im):
    x0, y0, x1, y1 = alpha_bbox(im)
    return {"x0": x0, "y0": y0, "x1": x1, "y1": y1, "w": x1 - x0, "h": y1 - y0,
            "cx": round((x0 + x1) / 2, 1), "bottom": y1}


# --- the warp ------------------------------------------------------------------------------
def premultiply(im):
    r, g, b, a = im.split()
    return Image.merge("RGBA", (ImageChops.multiply(r, a), ImageChops.multiply(g, a),
                                ImageChops.multiply(b, a), a))


def unpremultiply(im):
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                px[x, y] = (0, 0, 0, 0)
            elif a < 255:
                px[x, y] = (min(255, r * 255 // a), min(255, g * 255 // a), min(255, b * 255 // a), a)
    return im


def profile(v, b, hd):
    """Width multiplier at v (0 = top of the head, 1 = the feet).

    A Gaussian on the torso widens (b > 0) or narrows (b < 0) the body; a second Gaussian on the
    head pulls it back so a fat stage is a fat body, not a fat head.
    """
    torso = math.exp(-(((v - 0.58) / 0.30) ** 2))
    head = math.exp(-(((v - 0.07) / 0.16) ** 2))
    return 1.0 + b * torso - hd * head


def build(src_im, height, width, b, hd, k):
    """One stage: crop the ink, stretch it to `height`, warp every row horizontally by k*profile."""
    bb = alpha_bbox(src_im)
    crop = src_im.crop(bb)
    crop = premultiply(crop)
    crop = crop.resize((crop.width, height), Image.LANCZOS)
    spans = row_spans(crop)
    # The axis the whole drawing scales about: the mid-torso, so the body itself does not move
    # when the build changes. (Scaling about the bounding-box centre would let a raised arm drag
    # him sideways between stages.)
    mid = [y for y in (int(height * v) for v in (0.35, 0.40, 0.45, 0.50, 0.55)) if spans[y][0] is not None]
    axis = sum((spans[y][0] + spans[y][1]) / 2 for y in mid) / len(mid)

    canvas = Image.new("RGBA", (FRAME_W, FRAME_H), (0, 0, 0, 0))
    top = GROUND - height
    for y in range(height):
        lo, hi = spans[y]
        if lo is None:
            continue
        s = k * profile(y / (height - 1), b, hd)
        row = crop.crop((0, y, crop.width, y + 1))
        new_w = max(1, round(crop.width * s))
        row = row.resize((new_w, 1), Image.LANCZOS)
        # Every row grows about its own centre, so the girth is added around the body's own axis and
        # the stance is left alone; the row's centre keeps its offset from the mid-torso axis, which
        # is what lands on x=320. Widening about one fixed x instead pulled his belly to one side.
        centre = (lo + hi) / 2
        canvas.paste(row, (round(AXIS + (centre - axis) - centre * s), top + y))
    return unpremultiply(canvas)


def fit(src_im, height, width, b, hd, tries=6):
    """Solve the horizontal scale so the ink comes out exactly `width` px wide."""
    k = width / max(1, ink(src_im)["w"])
    out = None
    for _ in range(tries):
        out = build(src_im, height, width, b, hd, k)
        got = ink(out)["w"]
        if abs(got - width) <= 1:
            break
        k *= width / got
    return out, k


# --- commands ------------------------------------------------------------------------------
def measure():
    print(f"{'frame':<16}{'ink w':>7}{'ink h':>7}{'x0':>6}{'x1':>6}{'centre':>8}{'bottom':>8}")
    for key, *_ in STAGES:
        path = CRID / f"body-{key}-r7.webp"
        m = ink(Image.open(path).convert("RGBA"))
        print(f"{path.name:<16}{m['w']:>7}{m['h']:>7}{m['x0']:>6}{m['x1']:>6}{m['cx']:>8}{m['bottom']:>8}")
    widths = [ink(Image.open(CRID / f"body-{k}-r7.webp").convert("RGBA"))["w"] for k, *_ in STAGES]
    print("\nconsecutive ink-width difference:", [widths[i + 1] - widths[i] for i in range(len(widths) - 1)])


def sheet(out_path):
    """Side by side at the size he is actually drawn: 17.5vw on a 1080p stream, capped at 340px."""
    desk_w = min(max(150.0, 1920 * 0.175), 340.0)          # --bw on a 1920-wide stream
    scale = desk_w / 160 * (142 / 800)                      # viewBox px per frame px
    stages = []
    for key, *_ in STAGES:
        stages.append((key, Image.open(CRID / f"body-{key}-r7.webp").convert("RGBA")))
    pad, label_h = 26, 62
    widths = [max(1, round(im.width * scale)) for _, im in stages]
    heights = [max(1, round(im.height * scale)) for _, im in stages]
    sheet_w = sum(widths) + pad * (len(stages) + 1)
    sheet_h = max(heights) + pad * 2 + label_h
    out = Image.new("RGBA", (sheet_w, sheet_h), (15, 11, 23, 255))
    d = ImageDraw.Draw(out)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 13)
        bold = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 15)
    except OSError:
        font = bold = ImageFont.load_default()
    x = pad
    ground_y = pad + max(heights)
    d.line([(pad // 2, ground_y), (sheet_w - pad // 2, ground_y)], fill=(70, 52, 130, 255), width=1)
    for i, (key, im) in enumerate(stages):
        m = ink(im)
        small = im.resize((widths[i], heights[i]), Image.LANCZOS)
        out.alpha_composite(small, (x, ground_y - heights[i]))
        d.text((x, ground_y + 8), f"stage {i}  body={key}", fill=(244, 240, 255, 255), font=bold)
        d.text((x, ground_y + 26), f"{m['w']}x{m['h']} px ink", fill=(169, 139, 255, 255), font=font)
        d.text((x, ground_y + 42), f"{SUB_STEPS[i]}+ subs", fill=(134, 246, 188, 255), font=font)
        x += widths[i] + pad
    d.text((pad, 6), f"Crid body ladder at real desk size ({desk_w:.0f}px wide on a 1920px stream)",
           fill=(244, 240, 255, 255), font=bold)
    out.convert("RGB").save(out_path)
    print(f"sheet -> {out_path}  ({sheet_w}x{sheet_h}, {desk_w:.0f}px desk size)")


SUB_STEPS = [0, 4, 8, 12, 16, 20, 24]


def build_all():
    # This script warps the seven shipped frames in place, so a second run would warp the warp.
    # ladder.json records what the frames measured before the last run — if they already match the
    # built numbers, stop rather than compound the stretch.
    if LADDER_JSON.exists():
        prev = json.loads(LADDER_JSON.read_text())
        first = prev["stages"][0]
        now = ink(Image.open(CRID / f"body-{first['key']}-r7.webp").convert("RGBA"))
        if (now["w"], now["h"]) == (first["ink"]["w"], first["ink"]["h"]):
            sys.exit(f"{CRID.relative_to(ROOT)} already holds built frames ({now['w']}x{now['h']} for "
                     f"body={first['key']}). Restore the originals first:\n"
                     f"  git checkout HEAD -- public/desk-assets/crid/body-*.webp")
    widths, heights = [], []
    stages = []
    for key, height, width, b, hd in STAGES:
        src_path = CRID / f"body-{key}-r7.webp"
        src = Image.open(src_path).convert("RGBA")
        before = ink(src)
        out, k = fit(src, height, width, b, hd)
        after = ink(out)
        if after["x0"] <= 0 or after["x1"] >= FRAME_W or after["y0"] <= 0:
            print(f"WARNING body={key} touches the frame edge: {after}")
        out.save(src_path, "WEBP", quality=82, method=6)
        widths.append(after["w"])
        heights.append(after["h"])
        stages.append({"key": key, "ink": after, "scale": round(k, 4),
                       "was": {"w": before["w"], "h": before["h"]}})
        print(f"stage {len(stages) - 1}  body={key:<4} ink {after['w']}x{after['h']}  "
              f"centre {after['cx']}  bottom {after['bottom']}  was {before['w']}x{before['h']}")

    # Movement follows the build: the wider he is the slower and heavier he moves. Derived here so
    # the numbers the renderer uses are the numbers the frames measured.
    span = widths[-1] - widths[0]
    for s in stages:
        t = (s["ink"]["w"] - widths[0]) / span
        s["slow"] = round(1 + 0.45 * t, 3)
        s["heft"] = round(0.86 + 0.59 * t, 3)

    diffs = [{"from": stages[i]["key"], "to": stages[i + 1]["key"],
              "dw": stages[i + 1]["ink"]["w"] - stages[i]["ink"]["w"],
              "dh": stages[i + 1]["ink"]["h"] - stages[i]["ink"]["h"]}
             for i in range(len(stages) - 1)]
    doc = {"frame": [FRAME_W, FRAME_H], "ground": GROUND, "axis": AXIS, "sub_steps": SUB_STEPS,
           "min_step": {"w": min(d["dw"] for d in diffs), "h": min(d["dh"] for d in diffs)},
           "stages": stages, "diffs": diffs}
    LADDER_JSON.write_text(json.dumps(doc, indent=2) + "\n")
    print("\nconsecutive differences:", [(d["dw"], d["dh"]) for d in diffs])
    print(f"min consecutive ink-width step: {doc['min_step']['w']}px, height step: {doc['min_step']['h']}px")
    print(f"ladder -> {LADDER_JSON.relative_to(ROOT)}")


if __name__ == "__main__":
    args = sys.argv[1:]
    if args and args[0] == "--measure":
        measure()
    elif args and args[0] == "--sheet":
        sheet(args[1] if len(args) > 1 else "/home/team/shared/crid-body-ladder.png")
    else:
        build_all()
