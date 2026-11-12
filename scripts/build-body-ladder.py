#!/usr/bin/env python3
"""Build Crid's body ladder out of Snap's own renderer, at rotation 0.

WHY THIS WAS REBUILT
--------------------
The first ladder was cut from seven *different* Snap renders at rotation 7: 000/00 faced the camera,
3/0/5 were three-quarter turned, and 1/2 were turned further with a visibly smaller head. A weight
change therefore swapped the pose, the head size and the silhouette — it read as a different person,
not the same man heavier.

Snap's renderer takes a `body` parameter and returns the same avatar in the same front-facing pose at
genuinely different builds, so the ladder is seven real builds, not warps of one drawing. The owner
explored body=0..12 against the endpoint: 4/6/7/8/9/10/12 all return the same picture as body=4, so
the distinct builds are these seven, ordered lean -> heavy by measured ink:

    body=3  leanest    body=0  lean    body=4  light    body=5  average
    body=1  full       body=11 heavy   body=2  heaviest (belly, thicker limbs, same head)

Everything about the pose is identical across the three because it is one render: the head top, the
feet, the stance and the base body are the same pixels. Only the build changes. Anything the desk
wants between them is the renderer's own sub-step stretch, never a new drawing.

WHERE THE FRAMES COME FROM
--------------------------
`--fetch` asks preview.bitmoji.com/bm-preview/v3/avatar/body — the endpoint the owner's own
avatar URL uses (scripts/fetch-crid-views.mjs in the CRID archive) — at scale=2, rotation=0,
for the seven distinct builds, masters downscaled to 1050x1400. The face is the one the desk
ships: the RECIPE constant below is that avatar URL verbatim with `body` left free and the
backpack removed (`bag=-1`) — the bag is a prop he carries, not part of his render. He wears
Snap's minimum: a bare chest, the camo trousers, socks and shoes from the recipe. Snap has no
nude render — its floor is this under-layer, and it is the same on every stage.

FRAMING (what crid-bot.js assumes: INK_BOTTOM, FIG_X, FIG_Y)
-----------------------------------------------------------
Snap already returns the figure at 1050x1400 with the ink bottom near y=1319 and the mid-torso
near x≈526, identically for all seven bodies, so the framing is a pure translation onto
GROUND=1325 / AXIS=560. One shared shift, taken from the lean frame, so the head lands on the
same pixels in every stage and the face cannot jump when the build changes.

Needs Pillow (not a runtime dependency — this is a one-off asset tool):
  python3 -m pip install pillow

  python3 scripts/build-body-ladder.py --fetch    # download the seven masters from Snap
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

BODIES = [3, 0, 4, 5, 1, 11, 2]   # leanest -> heaviest, the seven distinct builds
SUB_STEPS = [0, 4, 8, 12, 16, 20, 24]
BODY_NAMES = {3: "leanest", 0: "lean", 4: "light", 5: "average",
              1: "full", 11: "heavy", 2: "heaviest"}

# The Snap recipe — the owner's own avatar URL (fetch-crid-views.mjs in the CRID archive), with
# `body` filled per stage by query() and the backpack taken off (`bag=-1`, its tones dropped with
# it): the bag is a prop, not clothing. Everything else is verbatim — trousers, socks, shoes,
# the gold hoops, the whole face. Tones are decimal integers: the endpoint answers 400 to 0x…
# values. `scale` is overridden per request in query() — the fetch is a 2100x2800 master.
API = "https://preview.bitmoji.com/bm-preview/v3/avatar/body"
RECIPE = (
    "scale=2 gender=1 style=5 rotation=0 bag=-1 "
    "beard=8696 body=0 bottom=10001984 "
    "bottom_tone1=0 bottom_tone10=0 bottom_tone2=0 bottom_tone3=0 bottom_tone4=0 "
    "bottom_tone5=0 bottom_tone6=0 bottom_tone7=0 bottom_tone8=0 bottom_tone9=0 "
    "breast=0 brow=1538 brow_tone=1579802 cheek_details=-1 clothing_type=1 ear=1424 "
    "earringL_lobe1=5 earringL_lobe1_tone1=16763909 earringL_lobe1_tone2=16763909 "
    "earringL_lobe1_tone3=16763909 earringL_lobe1_tone4=16763909 "
    "earringR_lobe1=5 earringR_lobe1_tone1=16763909 earringR_lobe1_tone2=16763909 "
    "earringR_lobe1_tone3=16763909 earringR_lobe1_tone4=16763909 "
    "eye=1626 eyelash=-1 eye_details=-1 eye_size=0 eye_spacing=0 face_lines=-1 "
    "face_proportion=10 footwear=866 "
    "footwear_tone1=16448250 footwear_tone10=16448250 footwear_tone2=16448250 "
    "footwear_tone3=16448250 footwear_tone4=16448250 footwear_tone5=16448250 "
    "footwear_tone6=16448250 footwear_tone7=16448250 footwear_tone8=16448250 "
    "footwear_tone9=16448250 glasses=-1 hair=1657 hair_tone=2039326 hat=-1 "
    "hat_tone1=10626095 hat_tone2=10626095 hat_tone3=10626095 hat_tone4=10626095 "
    "hat_tone5=10626095 hat_tone6=10626095 hat_tone7=10626095 hat_tone8=10626095 "
    "hat_tone9=10626095 is_tucked=0 jaw=1396 mouth=2338 nose=1449 "
    "pupil_tone=5977116 skin_tone=8080170 sock=295 "
    "sock_tone1=1907997 sock_tone2=8158331 sock_tone3=15132132 sock_tone4=1907997 ua=2"
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
        im = Image.open(__import__("io").BytesIO(data)).convert("RGBA")
        if im.size != (FRAME_W, FRAME_H):   # the scale=2 master is 2100x2800: downscale it
            im = im.resize((FRAME_W, FRAME_H), Image.LANCZOS)
        p = VIEWS / f"body-{body}-r0.png"
        im.save(p)
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

    # Movement follows the build: the more mass he carries, the slower and heavier he moves.
    # The builds differ in mass more than in silhouette width — only the heaviest frame is
    # measurably wider — so the ramp runs on ink area, the number that actually tracks it.
    areas = []
    for s in stages:
        a = Image.open(CRID / s["file"]).convert("RGBA").getchannel("A")
        areas.append(sum(a.histogram()[ALPHA_MIN + 1:]))
        s["area"] = areas[-1]
    span = areas[-1] - areas[0]
    for s, area in zip(stages, areas):
        t = (area - areas[0]) / span
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
    """The seven stages at the two sizes he is actually judged at: 336px on a 1920 stream, and the
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

    d.text((pad, pad - 4), "Crid body ladder — one Snap render at rotation 0, seven builds",
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
