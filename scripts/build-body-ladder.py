#!/usr/bin/env python3
"""Build Crid's body ladder out of Snap's own renderer, at rotation 0.

WHY THIS WAS REBUILT
--------------------
The first ladder was cut from seven *different* Snap renders at rotation 7: 000/00 faced the camera,
3/0/5 were three-quarter turned, and 1/2 were turned further with a visibly smaller head. A weight
change therefore swapped the pose, the head size and the silhouette — it read as a different person,
not the same man heavier.

Snap's renderer takes a `body` parameter and returns the same avatar in the same front-facing pose at
genuinely different builds, so the ladder is now three real builds, not seven warps of one drawing:

    body=0  lean      body=1  average      body=2  heavy (belly, thicker limbs, same head)

Everything about the pose is identical across the three because it is one render: the head top, the
feet, the stance and the base body are the same pixels. Only the build changes. Anything the desk
wants between them is the renderer's own sub-step stretch, never a new drawing.

WHERE THE FRAMES COME FROM
--------------------------
`--fetch` asks preview.bitmoji.com/avatar-builder-v3/preview/body at scale=3, rotation=0, for body=0,
1 and 2, and writes the masters to views/body-<n>-r0.png (1050x1400 PNG, the API's own size). The face
is the one the desk already ships — the parameters in fetch-crid-views.mjs, with the two gold hoops —
because crid-ladder-spec.md's recipe renders a different man: no earrings, a solid handlebar moustache
instead of the split one, a rounder hair line and heavy blush. There is no `outfit` parameter at all:
the owner's rule is *no cloth*, so he renders as Snap's base body — no camo cargos, no backpack
straps and no shoes, only the renderer's own plain base layer over bare feet. `outfit=-1` is
rejected with HTTP 400, so the parameter is simply omitted.

FRAMING (what crid-bot.js assumes: INK_BOTTOM, FIG_X, FIG_Y)
-----------------------------------------------------------
Snap already returns the figure at 1050x1400 with the ink bottom on y=1322 and the mid-torso on
x≈527.5, identically for all three bodies, so the framing is a pure translation: +3px down puts the
ink bottom on y=1325, +32px right puts the mid-torso on x=560. One shared shift, taken from the lean
frame, so the head lands on the same pixels in every stage and the face cannot jump when the build
changes.

Needs Pillow (not a runtime dependency — this is a one-off asset tool):
  python3 -m pip install pillow

  python3 scripts/build-body-ladder.py --fetch    # download the three masters from Snap
  python3 scripts/build-body-ladder.py            # frame + measure: frames, ladder.json
  python3 scripts/build-body-ladder.py --measure  # print the ink box of every shipped frame
  python3 scripts/build-body-ladder.py --sheet OUT.png   # comparison sheet at 336px and 150px
"""
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
CRID = ROOT / "public" / "desk-assets" / "crid"
VIEWS = ROOT / "views"
LADDER_JSON = CRID / "ladder.json"

FRAME_W, FRAME_H = 1050, 1400
GROUND = 1325         # ink bottom, the y crid-bot.js maps onto the floor line
AXIS = 560            # torso axis, the x crid-bot.js maps onto the sprite centre
ALPHA_MIN = 8
QUALITY = 88          # webp quality: a 1050x1400 frame still has to be light to load on air

BODIES = [0, 1, 2]    # lean, average, heavy
SUB_STEPS = [0, 8, 16]
BODY_NAMES = {0: "lean", 1: "average", 2: "heavy"}

# The Snap recipe. The face is the one the desk ships (fetch-crid-views.mjs). No `outfit` — the
# owner's rule is no cloth, and `outfit=-1` answers 400; the clothing qualifiers that go with an
# outfit (clothing_type / is_tucked / ua / breast) are gone with it. Tones are decimal integers:
# the endpoint also answers 400 to 0x… values.
API = "https://preview.bitmoji.com/avatar-builder-v3/preview/body"
RECIPE = (
    "scale=3 gender=1 style=5 rotation=0 "
    "beard=8696 brow=1538 cheek_details=-1 ear=1424 eye=1626 eyelash=-1 eye_details=-1 "
    "face_lines=-1 glasses=-1 hair=1657 hat=-1 jaw=1396 mouth=2338 nose=1449 "
    "earringL_lobe1=5 earringL_lobe1_tone1=16763909 earringL_lobe1_tone2=16763909 "
    "earringL_lobe1_tone3=16763909 earringL_lobe1_tone4=16763909 "
    "earringR_lobe1=5 earringR_lobe1_tone1=16763909 earringR_lobe1_tone2=16763909 "
    "earringR_lobe1_tone3=16763909 earringR_lobe1_tone4=16763909 "
    "face_proportion=10 eye_spacing=0 eye_size=0 "
    "brow_tone=1579802 hair_tone=2039326 pupil_tone=5977116 skin_tone=8080170"
)


# --- measuring -----------------------------------------------------------------------------
def alpha_bbox(im):
    a = im.getchannel("A").point(lambda v: 255 if v > ALPHA_MIN else 0)
    return a.getbbox()


def ink(im):
    x0, y0, x1, y1 = alpha_bbox(im)
    return {"x0": x0, "y0": y0, "x1": x1, "y1": y1, "w": x1 - x0, "h": y1 - y0,
            "cx": round((x0 + x1) / 2, 1), "bottom": y1}


def mid_torso_axis(im):
    """The centre of the body between the shoulders and the hips — the axis the figure stands on."""
    a = im.getchannel("A").load()
    x0, y0, x1, y1 = alpha_bbox(im)
    h = y1 - y0
    centres = []
    for y in range(y0 + int(h * .35), y0 + int(h * .55)):
        lo = hi = None
        for x in range(im.width):
            if a[x, y] > ALPHA_MIN:
                if lo is None:
                    lo = x
                hi = x
        if lo is not None:
            centres.append((lo + hi) / 2)
    return sum(centres) / len(centres)


# --- fetching ------------------------------------------------------------------------------
def query(body):
    q = {}
    for pair in RECIPE.split():
        k, v = pair.split("=")
        q[k] = str(int(v, 16)) if v.lower().startswith("0x") else v
    q["body"] = str(body)
    return q


def fetch():
    VIEWS.mkdir(exist_ok=True)
    for body in BODIES:
        url = API + "?" + urllib.parse.urlencode(query(body))
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=90) as r:
            data = r.read()
            ctype = r.headers.get("content-type")
        if not ctype.startswith("image"):
            raise SystemExit(f"body={body}: the API answered {ctype!r}, not an image")
        p = VIEWS / f"body-{body}-r0.png"
        p.write_bytes(data)
        print(f"body={body}  {ctype}  {len(data) / 1024:.0f} KB  -> {p.relative_to(ROOT)}")


# --- framing -------------------------------------------------------------------------------
def master(body):
    p = VIEWS / f"body-{body}-r0.png"
    if not p.exists():
        raise SystemExit(f"missing {p.relative_to(ROOT)} — run with --fetch first")
    im = Image.open(p).convert("RGBA")
    if im.size != (FRAME_W, FRAME_H):
        raise SystemExit(f"{p.name} is {im.size}, expected {(FRAME_W, FRAME_H)}")
    return im


def frame(im, dx, dy):
    canvas = Image.new("RGBA", (FRAME_W, FRAME_H), (0, 0, 0, 0))
    canvas.paste(im, (dx, dy))
    return canvas


def build_all():
    masters = {b: master(b) for b in BODIES}
    # One shared shift, solved on the lean frame: every stage then has its head on the same pixels.
    dx = round(AXIS - mid_torso_axis(masters[0]))
    dy = GROUND - ink(masters[0])["bottom"]

    stages, widths = [], []
    for body in BODIES:
        was = ink(masters[body])
        out = frame(masters[body], dx, dy)
        got = ink(out)
        if got["bottom"] != GROUND:
            raise SystemExit(f"body={body} lands its feet on y={got['bottom']}, not {GROUND}")
        if got["x0"] <= 0 or got["x1"] >= FRAME_W or got["y0"] <= 0:
            raise SystemExit(f"body={body} touches the frame edge: {got}")
        p = CRID / f"body-{body}-r0.webp"
        out.save(p, "WEBP", quality=QUALITY, method=6)
        widths.append(got["w"])
        stages.append({"key": str(body), "ink": got, "was": {"w": was["w"], "h": was["h"]},
                       "file": p.name})
        print(f"body={body} ({BODY_NAMES[body]:<7}) ink {got['w']}x{got['h']}  "
              f"x {got['x0']}..{got['x1']}  cx {got['cx']}  top {got['y0']}  "
              f"bottom {got['bottom']}  {p.name}  {p.stat().st_size / 1024:.0f} KB")

    # Movement follows the build: the wider he is, the slower and heavier he moves. Derived from the
    # widths measured here, so the numbers the renderer uses are the numbers the frames have.
    span = widths[-1] - widths[0]
    for s in stages:
        t = (s["ink"]["w"] - widths[0]) / span
        s["slow"] = round(1 + 0.45 * t, 3)
        s["heft"] = round(0.86 + 0.59 * t, 3)

    diffs = [{"from": stages[i]["key"], "to": stages[i + 1]["key"],
              "dw": stages[i + 1]["ink"]["w"] - stages[i]["ink"]["w"],
              "dh": stages[i + 1]["ink"]["h"] - stages[i]["ink"]["h"]}
             for i in range(len(stages) - 1)]
    doc = {"frame": [FRAME_W, FRAME_H], "ground": GROUND, "axis": AXIS,
           "rotation": 0, "sub_steps": SUB_STEPS,
           "min_step": {"w": min(d["dw"] for d in diffs), "h": min(d["dh"] for d in diffs)},
           "stages": stages, "diffs": diffs}
    LADDER_JSON.write_text(json.dumps(doc, indent=2) + "\n")
    print("\nconsecutive differences:", [(d["dw"], d["dh"]) for d in diffs])
    print(f"min consecutive ink-width step: {doc['min_step']['w']}px, "
          f"height step: {doc['min_step']['h']}px")
    print(f"ladder -> {LADDER_JSON.relative_to(ROOT)}")


# --- commands ------------------------------------------------------------------------------
def measure():
    print(f"{'frame':<18}{'ink w':>7}{'ink h':>7}{'x0':>6}{'x1':>6}{'centre':>8}{'top':>7}{'bottom':>8}")
    for body in BODIES:
        p = CRID / f"body-{body}-r0.webp"
        m = ink(Image.open(p).convert("RGBA"))
        print(f"{p.name:<18}{m['w']:>7}{m['h']:>7}{m['x0']:>6}{m['x1']:>6}{m['cx']:>8}"
              f"{m['y0']:>7}{m['bottom']:>8}")


def sheet(out_path):
    """The three stages at the two sizes he is actually judged at: 336px on a 1920 stream, and the
    150px phone width. If a limb disappears at 150px the silhouette is wrong."""
    sizes = [336, 150]
    pad, label_h, gap = 24, 54, 26
    rows = []
    for w in sizes:
        tiles = []
        for body in BODIES:
            im = Image.open(CRID / f"body-{body}-r0.webp").convert("RGBA")
            h = round(im.height * w / im.width)
            tiles.append((body, im.resize((w, h), Image.LANCZOS), ink(im)))
        rows.append((w, tiles))

    sheet_w = max(sum(t[1].width for t in tiles) + gap * (len(tiles) - 1) for _, tiles in rows)
    sheet_w += pad * 2
    sheet_h = pad + 26
    for w, tiles in rows:
        sheet_h += label_h + max(t[1].height for t in tiles) + pad
    out = Image.new("RGBA", (sheet_w, sheet_h), (15, 11, 23, 255))
    d = ImageDraw.Draw(out)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 14)
        bold = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 17)
        small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 12)
    except OSError:
        font = bold = small = ImageFont.load_default()

    d.text((pad, pad - 4), "Crid body ladder — one Snap render at rotation 0, three builds",
           fill=(244, 240, 255, 255), font=bold)
    y = pad + 26
    for w, tiles in rows:
        d.text((pad, y), f"{w}px wide" + ("  (phone scale)" if w == 150 else "  (1920 stream)"),
               fill=(169, 139, 255, 255), font=font)
        y += label_h - 16
        ground = y + max(t[1].height for t in tiles)
        x = pad
        d.line([(pad // 2, ground), (sheet_w - pad // 2, ground)], fill=(70, 52, 130, 255), width=1)
        for body, im, m in tiles:
            out.alpha_composite(im, (x, ground - im.height))
            d.text((x, ground + 6), f"{BODY_NAMES[body]}  body={body}", fill=(244, 240, 255, 255),
                   font=font)
            d.text((x, ground + 24), f"{m['w']}x{m['h']} px ink in the frame", fill=(134, 246, 188, 255),
                   font=small)
            x += im.width + gap
        y = ground + label_h
    out.convert("RGB").save(out_path)
    print(f"sheet -> {out_path}  ({sheet_w}x{sheet_h})")


if __name__ == "__main__":
    args = sys.argv[1:]
    if args and args[0] == "--fetch":
        fetch()
    elif args and args[0] == "--measure":
        measure()
    elif args and args[0] == "--sheet":
        sheet(args[1] if len(args) > 1 else "/home/team/shared/crid-body-ladder.png")
    else:
        build_all()
