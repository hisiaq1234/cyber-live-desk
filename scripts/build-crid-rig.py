#!/usr/bin/env python3
"""Cut Crid's base body render into a limb rig, without drawing anything.

WHAT THIS DOES
--------------
public/desk-assets/crid/body-000-r7.webp is one flat drawing: head, torso, two arms and two
legs painted into a single 1050x1400 picture. A walk can only translate that picture, so his
legs never step and his arms never swing. This script slices the same pixels into ten pieces —
head, torso, upper arm / forearm+hand per side, thigh / shin+foot per side — and writes the
joint positions the overlay pivots them on. Nothing is redrawn, regenerated or imported: every
piece is a crop of the shipped render, and `--check` proves the ten pieces reassemble into it
pixel for pixel.

HOW THE CUT IS MADE
-------------------
The render is a front view on a transparent ground, so the anatomy is read off the alpha
channel rather than guessed:

  * the neck is the narrowest single run of ink between the head and the shoulders;
  * each arm is the outermost run of each row below the shoulder, clipped to the arm's own
    measured width — the left arm is fused to the hanging vest flap for a few rows, and taking
    the outer band keeps the vest with the torso where it belongs;
  * the crotch is the first row where the body splits into two runs, and the hip pivot sits
    just above it on each leg's own axis;
  * the knee is a little under half way from the crotch to the top of the shoe;
  * the elbow is half way from the shoulder to the wrist.

Every joint gets a CAP: a disc centred on the pivot, taken out of the parent piece and given to
the child. A disc is the one shape a rotation about its own centre cannot change, so the child
covers the joint at any angle while the parent's hole stays exactly filled — no gap opens at a
shoulder, elbow, hip or knee as he moves.

Framing is the render's own (1050x1400, feet on y=1325, torso axis on x=560), so a rigged
frame lands exactly where the flat drawing did.

OUTPUT
------
  public/desk-assets/crid/rig/*.png   ten pieces, cropped to their own ink
  public/desk-assets/crid/rig.json    the pieces' boxes and every joint, in render pixels
  public/desk-assets/crid/rig.mjs     the same table as an ES module the overlay imports

Needs Pillow (the same one-off asset dependency build-body-ladder.py uses):
  python3 -m pip install pillow

  python3 scripts/build-crid-rig.py            # re-cut the pieces and rewrite the tables
  python3 scripts/build-crid-rig.py --check    # reassemble and compare with the shipped render
  python3 scripts/build-crid-rig.py --measure  # print the anatomy the cut is based on
  python3 scripts/build-crid-rig.py --poses OUT.png   # a strip of the rig mid-stride
"""
import json
import sys
from collections import deque
from pathlib import Path

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parent.parent
CRID = ROOT / "public" / "desk-assets" / "crid"
SOURCE = CRID / "body-000-r7.webp"
OUT = CRID / "rig"

# --- the render's own framing (crid-bot.js: INK_BOTTOM / FIG_X / FIG_W / FIG_Y) --------------
W, H = 1050, 1400
INK_BOTTOM = 1325

# --- tunables, all in render pixels ---------------------------------------------------------
# The arm's painted width. The left arm touches the hanging vest flap for a few rows near the
# shoulder, so each row's arm is the outer ARM_W pixels of its outermost run rather than the
# whole run. The hand is wider and its fingers stand apart, so below the wrist the band is wider
# still — a narrower one would leave the separated fingers behind in the torso.
ARM_W = 27
HAND_W = 46
# How much of the child's own pixels the parent keeps below each cut. A limb 71px across turning
# 9 degrees tips its cut edge by 35*sin(9) = 5.5px, so a collar of 14 covers the widest joint he
# has with room to spare.
COLLAR = 14
# Where the head is cut off the neck, as a fraction of the way down the narrowest neck row.
NECK_DROP = 17
# The knee, as a fraction of the way from the crotch to the top of the shoe.
KNEE_FRAC = 0.48


def alpha(img):
    return img.split()[3].load()


def runs(a, y, thr=16, x0=0, x1=None):
    """The opaque runs of row y, as (start, end) inclusive."""
    x1 = W - 1 if x1 is None else x1
    out, s = [], None
    for x in range(x0, x1 + 1):
        if a[x, y] > thr:
            if s is None:
                s = x
        elif s is not None:
            out.append((s, x - 1))
            s = None
    if s is not None:
        out.append((s, x1))
    return out


def bbox(img):
    return img.split()[3].point(lambda v: 255 if v > 0 else 0).getbbox()


def measure(img):
    """Read the anatomy off the alpha channel. Everything the cut depends on is measured here."""
    a = alpha(img)
    box = bbox(img)
    if box is None:
        raise SystemExit("body-000-r7.webp has no opaque pixels: nothing to cut")
    # The render must actually have a transparent ground, or a cut-out rig is meaningless.
    px = [a[0, y] for y in range(0, H, 7)] + [a[W - 1, y] for y in range(0, H, 7)] + \
         [a[x, 0] for x in range(0, W, 7)] + [a[x, H - 1] for x in range(0, W, 7)]
    if any(v > 8 for v in px):
        raise SystemExit("the render's border is not transparent — the alpha channel is not a cut-out")

    # --- the neck: the narrowest single run between the jaw and the shoulders ---------------
    neck_y, neck_w = None, 10 ** 9
    for y in range(int(H * .29), int(H * .39)):
        r = runs(a, y)
        if len(r) == 1:
            w = r[0][1] - r[0][0] + 1
            if w < neck_w:
                neck_y, neck_w = y, w
    if neck_y is None:
        raise SystemExit("could not find the neck: the head and shoulders never narrow to one run")
    head_cut = neck_y + NECK_DROP

    # --- the arms: the outermost run of each row, clipped to the arm's own width -------------
    # The shoulder is the first row where the ink splits into three: a torso with an arm either
    # side of it. Above that the arms are painted into the body and there is nothing to cut.
    shoulder_y = None
    for y in range(head_cut, int(H * .55)):
        r = [q for q in runs(a, y) if q[1] - q[0] >= 8]
        if len(r) >= 3:
            shoulder_y = y
            break
    if shoulder_y is None:
        raise SystemExit("could not find the shoulders: the arms never separate from the torso")

    def raw_band(y):
        """(leftmost, rightmost) run on row y, before the arm is clipped out of it."""
        r = [q for q in runs(a, y) if q[1] - q[0] >= 6]
        if not r:
            return None, None
        left = r[0] if r[0][0] < 470 else None
        right = r[-1] if r[-1][1] > 640 else None
        return left, right

    def arm_band(y, wrist=None):
        """(left arm run, right arm run) on row y, or (None, None) where there is no arm."""
        left, right = raw_band(y)
        w = HAND_W if wrist is not None and y >= wrist else ARM_W
        if left and left[1] - left[0] + 1 > w:
            left = (left[0], left[0] + w - 1)
        if right and right[1] - right[0] + 1 > w:
            right = (right[1] - w + 1, right[1])
        return left, right

    # The hand ends where the outer band stops reaching out past the torso's own edge. The band
    # has to stay narrow as well: below him the shoe also reaches past x=460, and a shoe is not a
    # hand.
    hand_bottom = shoulder_y
    for y in range(shoulder_y, int(H * .75)):
        l, r = raw_band(y)
        if (l and l[0] < 460 and l[1] - l[0] + 1 <= ARM_W) or (r and r[1] > 680 and r[1] - r[0] + 1 <= ARM_W):
            hand_bottom = y

    def band_centre(y, side):
        l, r = arm_band(y)
        b = l if side == "l" else r
        if not b:
            return None
        return (b[0] + b[1]) / 2

    shoulder = {}
    for side in ("l", "r"):
        # The arm's axis two rows into the cut, carried up to the top of the humerus.
        c = band_centre(shoulder_y + 4, side)
        shoulder[side] = (round(c, 1), shoulder_y - 3)
    # The wrist is where the forearm stops widening into the hand; the elbow sits half way
    # between the shoulder and it, on the arm's own axis.
    wrist_y = shoulder_y + round((hand_bottom - shoulder_y) * .72)
    elbow = {}
    for side in ("l", "r"):
        ey = shoulder_y + round((wrist_y - shoulder_y) * .5)
        elbow[side] = (round(band_centre(ey, side), 1), ey)

    # --- the legs: the crotch is the first row where the body splits in two ------------------
    crotch_y, legs = None, None
    for y in range(int(H * .58), int(H * .75)):
        r = [q for q in runs(a, y, x0=460, x1=670) if q[1] - q[0] >= 20]
        if len(r) == 2:
            crotch_y, legs = y, r
            break
    if crotch_y is None:
        raise SystemExit("could not find the crotch: the legs never separate")
    # The top of the shoe: the first white row below the knee band, i.e. where the denim ends.
    shoe_top = None
    for y in range(crotch_y + 60, H):
        r = [q for q in runs(a, y, x0=460, x1=670) if q[1] - q[0] >= 20]
        if r and all(sum(img.getpixel(((q[0] + q[1]) // 2, y))[:3]) / 3 > 150 for q in r):
            shoe_top = y
            break
    if shoe_top is None:
        raise SystemExit("could not find the shoes: no white band under the denim")

    hip, knee = {}, {}
    for side, i in (("l", 0), ("r", 1)):
        q = legs[i]
        hip[side] = (round((q[0] + q[1]) / 2, 1), crotch_y - 6)
        ky = crotch_y + round((shoe_top - crotch_y) * KNEE_FRAC)
        r = [t for t in runs(a, ky, x0=460, x1=670) if t[1] - t[0] >= 20]
        k = r[i] if len(r) > i else q
        knee[side] = (round((k[0] + k[1]) / 2, 1), ky)

    return {
        "source": {"w": W, "h": H, "inkBottom": INK_BOTTOM, "box": list(box)},
        "neck": {"y": head_cut, "narrowest": neck_y},
        "shoulder": shoulder, "elbow": elbow, "wristY": wrist_y, "handBottom": hand_bottom,
        "shoulderY": shoulder_y, "hip": hip, "knee": knee,
        "crotchY": crotch_y, "shoeTop": shoe_top, "armW": ARM_W,
    }


def mask_from(pred, y0, y1):
    """A byte mask over the whole canvas, set where pred(x, y) is true."""
    m = Image.new("L", (W, H), 0)
    p = m.load()
    for y in range(max(0, y0), min(H, y1)):
        for x in range(W):
            if pred(x, y):
                p[x, y] = 255
    return m


def build(img, m):
    """Cut the ten pieces. Every pixel of the render belongs to exactly one of them."""
    a = alpha(img)
    # Every pixel with any alpha at all belongs to exactly one piece: a threshold here would
    # drop the anti-aliased edge of the drawing and leave a hairline of nothing around him.
    ink = lambda x, y: a[x, y] > 0

    # --- arms ---------------------------------------------------------------------------
    arm = {}
    for side in ("l", "r"):
        def in_arm(x, y, side=side):
            if y < m["shoulderY"] or y > m["handBottom"]:
                return False
            r = [q for q in runs(a, y) if q[1] - q[0] >= 6]
            if not r:
                return False
            b = r[0] if side == "l" else r[-1]
            if side == "l" and b[0] >= 470:
                return False
            if side == "r" and b[1] <= 640:
                return False
            w = HAND_W if y >= m["wristY"] else ARM_W
            if b[1] - b[0] + 1 > w:
                b = (b[0], b[0] + w - 1) if side == "l" else (b[1] - w + 1, b[1])
            return b[0] <= x <= b[1]
        arm[side] = in_arm

    # --- legs ---------------------------------------------------------------------------
    def in_leg(x, y, side):
        # His hands hang to the level of the crotch, so a leg is never anything the arm already
        # owns — otherwise the hand would be cut into the thigh as well.
        if y < m["crotchY"] or arm["l"](x, y) or arm["r"](x, y):
            return False
        return (x < 560) if side == "l" else (x >= 560)

    # --- the masks ------------------------------------------------------------------------
    # Each joint is a straight cut: the child owns everything below it, the parent everything
    # above. A straight cut on a turning limb opens a thin wedge at the joint — the child's cut
    # edge tips away from the parent's — so the parent also keeps a COLLAR of the child's own
    # pixels just below the cut, and every child is drawn over its parent. At rest the collar is
    # hidden under the child and the two are the same drawing; as he moves it fills the wedge.
    # Nothing is drawn twice on screen: the overlap is identical pixels.
    masks = {}
    for side in ("l", "r"):
        ey = m["elbow"][side][1]
        ky = m["knee"][side][1]
        band = arm[side]
        shin = lambda x, y, s=side, ky=ky: ink(x, y) and in_leg(x, y, s) and y >= ky
        fore = lambda x, y, b=band, ey=ey: ink(x, y) and b(x, y) and y >= ey
        masks["shin-" + side] = mask_from(shin, 0, H)
        masks["arm-fore-" + side] = mask_from(fore, 0, H)
        masks["thigh-" + side] = mask_from(
            lambda x, y, s=side, ky=ky, shin=shin: ink(x, y) and (
                (in_leg(x, y, s) and y < ky) or (shin(x, y) and y < ky + COLLAR)), 0, H)
        masks["arm-upper-" + side] = mask_from(
            lambda x, y, b=band, ey=ey, fore=fore: ink(x, y) and (
                (b(x, y) and y < ey) or (fore(x, y) and y < ey + COLLAR)), 0, H)

    # The head is everything above the neck cut; the torso is every pixel no limb claimed, plus
    # the collar it owes the arms at the shoulder and the legs at the crotch.
    claimed = Image.new("L", (W, H), 0)
    for mk in masks.values():
        claimed = ImageChops.lighter(claimed, mk)
    cp = claimed.load()
    shoulder_y = m["shoulderY"]
    crotch_y = m["crotchY"]

    def torso_owns(x, y):
        if y < m["neck"]["y"] or not ink(x, y):
            return False
        if cp[x, y] == 0:
            return True
        # The collar: the first COLLAR pixels of each arm below the shoulder cut, and of each leg
        # below the crotch, kept so the joint cannot open a hole.
        if shoulder_y <= y < shoulder_y + COLLAR:
            return arm["l"](x, y) or arm["r"](x, y)
        if crotch_y <= y < crotch_y + COLLAR:
            return in_leg(x, y, "l") or in_leg(x, y, "r")
        return False

    masks["head"] = mask_from(lambda x, y: ink(x, y) and y < m["neck"]["y"], 0, H)
    masks["torso"] = mask_from(torso_owns, 0, H)
    return masks


PIECES = ["thigh-l", "shin-l", "thigh-r", "shin-r", "torso", "head", "arm-upper-l", "arm-fore-l", "arm-upper-r", "arm-fore-r"]


def cut(img, masks):
    out = {}
    for name in PIECES:
        piece = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        piece.paste(img, (0, 0), masks[name])
        box = bbox(piece)
        if box is None:
            raise SystemExit(f"piece {name} came out empty — the cut points are wrong")
        out[name] = (piece.crop(box), box)
    return out


def rig_table(m, pieces):
    """The table the overlay reads: where each piece sits and what it turns about."""
    def j(p):
        return {"x": round(p[0], 1), "y": round(p[1], 1)}
    order = ["thigh-l", "shin-l", "thigh-r", "shin-r", "torso", "head", "arm-upper-l", "arm-fore-l", "arm-upper-r", "arm-fore-r"]
    return {
        "source": {"w": W, "h": H, "inkBottom": INK_BOTTOM},
        "order": order,
        "pivot": {
            "head": j((560, m["neck"]["y"])),
            "shoulder-l": j(m["shoulder"]["l"]), "shoulder-r": j(m["shoulder"]["r"]),
            "elbow-l": j(m["elbow"]["l"]), "elbow-r": j(m["elbow"]["r"]),
            "hip-l": j(m["hip"]["l"]), "hip-r": j(m["hip"]["r"]),
            "knee-l": j(m["knee"]["l"]), "knee-r": j(m["knee"]["r"]),
        },
        "pieces": {n: {"x": b[0], "y": b[1], "w": b[2] - b[0], "h": b[3] - b[1],
                       "src": f"./desk-assets/crid/rig/{n}.png"} for n, (_, b) in pieces.items()},
    }


def write(img, m, pieces, table):
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (piece, box) in pieces.items():
        piece.save(OUT / f"{name}.png", optimize=True)
    (CRID / "rig.json").write_text(json.dumps(table, indent=2) + "\n")
    (CRID / "rig.mjs").write_text(
        "// GENERATED by scripts/build-crid-rig.py — do not edit by hand.\n"
        "// Crid's base render cut into limbs: where each piece sits in the 1050x1400 frame and the\n"
        "// joint it turns about. body-000-r7.webp is the only stage with a rig; every other body\n"
        "// in the ladder is still the flat drawing.\n"
        f"export const RIG={json.dumps(table, separators=(',', ':'))};\n")


def check(img, pieces):
    """The ten pieces must put the render back together, pixel for pixel.

    Every pixel of his ink has to be covered by at least one piece — a gap in the cut is a hole
    in him — and pasting the pieces back in layer order has to reproduce the shipped render
    exactly. Where two pieces overlap (a parent's collar under a child's cut) both carry the same
    pixels, so the overlap is a joint, not a second drawing.
    """
    cover = Image.new("L", (W, H), 0)
    for name in PIECES:
        piece, box = pieces[name]
        cover.paste(ImageChops.add(cover.crop(box), piece.split()[3].point(lambda v: 1 if v else 0)), box)
    ink = img.split()[3].point(lambda v: 1 if v else 0)
    missing = ImageChops.subtract(ink, cover)
    if missing.getbbox() is not None:
        raise SystemExit(f"the cut leaves a hole in him at {missing.getbbox()}")

    re = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    rp = re.load()
    for name in PIECES:
        piece, box = pieces[name]
        pp = piece.load()
        for y in range(piece.height):
            for x in range(piece.width):
                v = pp[x, y]
                if v[3]:
                    rp[box[0] + x, box[1] + y] = v
    if ImageChops.difference(re.split()[3], img.split()[3]).getbbox() is not None:
        raise SystemExit("the pieces do not reproduce the render's alpha channel")
    # The render carries colour under its fully transparent pixels; a piece that is transparent
    # carries none. Nothing on screen can show the difference, so the comparison is made where
    # he is actually visible.
    visible = img.split()[3].point(lambda v: 255 if v else 0)
    diff = Image.composite(ImageChops.difference(re, img), Image.new("RGBA", (W, H), (0, 0, 0, 0)), visible)
    if diff.getbbox() is not None:
        raise SystemExit(f"the pieces do not reproduce the render where he is visible ({diff.getbbox()})")
    print(f"ok: {len(PIECES)} pieces cover every pixel of body-000-r7.webp and reassemble into it exactly")


def poses(table, pieces, out):
    """A strip of the rig at four points of the stride, drawn the way the overlay draws it."""
    S = 0.34
    frames = 4
    sheet = Image.new("RGBA", (int(340 * S) * frames, int(1190 * S)), (18, 18, 26, 255))

    def draw(ang, leg, arm_swing):
        c = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        p = table["pivot"]

        def place(name, pivot, deg):
            piece, box = pieces[name]
            im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            im.paste(piece, (box[0], box[1]))
            r = im.rotate(-deg, resample=Image.BICUBIC, center=(pivot["x"], pivot["y"]))
            return r
        # legs behind the torso
        for side, sgn in (("l", 1), ("r", -1)):
            th = place(f"thigh-{side}", p[f"hip-{side}"], leg * sgn)
            sh = place(f"shin-{side}", p[f"knee-{side}"], leg * sgn * .8)
            c = Image.alpha_composite(c, Image.alpha_composite(th, sh))
        c = Image.alpha_composite(c, place("torso", p["head"], 0))
        c = Image.alpha_composite(c, place("head", p["head"], 0))
        for side, sgn in (("l", -1), ("r", 1)):
            ua = place(f"arm-upper-{side}", p[f"shoulder-{side}"], arm_swing * sgn)
            fa = place(f"arm-fore-{side}", p[f"elbow-{side}"], arm_swing * sgn * .7)
            c = Image.alpha_composite(c, Image.alpha_composite(ua, fa))
        return c
    for i in range(frames):
        import math
        u = i / frames
        f = draw(0, 13 * math.sin(2 * math.pi * u), 11 * math.sin(2 * math.pi * u))
        f = f.crop((380, 150, 720, 1340)).resize((int(340 * S), int(1190 * S)))
        sheet.alpha_composite(f, (int(340 * S) * i, 0))
    sheet.save(out)
    print(f"wrote {out}")


def main(argv):
    if not SOURCE.exists():
        raise SystemExit(f"missing {SOURCE}")
    img = Image.open(SOURCE).convert("RGBA")
    if img.size != (W, H):
        raise SystemExit(f"{SOURCE.name} is {img.size}, expected {(W, H)}")
    m = measure(img)
    if "--measure" in argv:
        print(json.dumps({k: v for k, v in m.items() if k != "source"}, indent=2))
        return 0
    pieces = cut(img, build(img, m))
    table = rig_table(m, pieces)
    check(img, pieces)
    write(img, m, pieces, table)
    print(f"wrote {len(pieces)} pieces to {OUT.relative_to(ROOT)} and rig.json / rig.mjs")
    if "--poses" in argv:
        poses(table, pieces, argv[argv.index("--poses") + 1])
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
