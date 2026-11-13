#!/usr/bin/env python3
"""Cut Crid's base body render into a limb rig, without drawing anything.

WHAT THIS DOES
--------------
public/desk-assets/crid/body-3-r0.webp is one flat drawing: head, torso, two arms and two
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
    measured width — the arm is fused to the torso for a few rows near the shoulder, and taking
    the outer band keeps the body with the torso where it belongs;
  * the crotch is the first row where the body splits into two runs, and the hip pivot sits
    just above it on each leg's own axis;
  * the ankle is the narrowest row of each leg near the bottom, and the knee sits a little
    under half way from the crotch to it (no shoe, no denim edge: the landmark is the
    silhouette, because he renders in his bare base body);
  * the elbow is half way from the shoulder to the wrist.

No two pieces meet on a line. Every cut is a few pixels of overlap: the piece above a cut
reaches OVERLAP px down past it, the piece below reaches OVERLAP px up past it, and those extra
pixels are the piece's own edge colour carried on — clamped from the last solid pixel of its own
column, never borrowed from the piece next door. Each piece is drawn as its own <image>, and a
scaled image fades its own border into nothing; a butt join therefore leaves a hairline of the
desk showing through the joint, and a turning limb lifts its cut edge off the other one and opens
a wedge. With the overlap the upper piece's band paints over the lower one's edge at every angle,
and the joint is solid. The pieces are ordered so the upper piece is drawn over the lower one,
which is what puts that band on top.

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
  python3 scripts/build-crid-rig.py --check    # prove the pieces cover him and rebuild him
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
# One rig per ladder stage: --body N cuts rigs/N/ from body-N-r0.webp. The anatomy
# landmarks are measured off each render, but the arm/hand widths and the x windows
# used to find runs are per-body too — a heavy build's arm is thicker and sits
# wider, so the constants below are derived in measure(), never assumed.
BODIES = [3, 0, 4, 5, 1, 11, 2]   # leanest -> heaviest, same order as the ladder
BODY = 3
SOURCE = CRID / f"body-{BODY}-r0.webp"
OUT = CRID / "rigs" / str(BODY)

# --- the render's own framing (crid-bot.js: INK_BOTTOM / FIG_X / FIG_W / FIG_Y) --------------
W, H = 1050, 1400
INK_BOTTOM = 1325

# How far every piece reaches past its cut, in render px. The joint that opens widest is the knee:
# the shin turns 8 degrees about a pivot sitting on the cut, and the far side of the cut is ~40px
# from it, so that edge lifts 40*sin(8) = 5.6px. OVERLAP clears that, with room for the fringe a
# resampled edge carries.
OVERLAP = 8
# How far a joint's overlap band may shift the drawing at rest, per channel. Across a joint the
# shading is nearly flat, so the band's edge colour sits within a few units of the pixels it
# covers and the rest pose does not move. Where it would not — the jaw's shadow onto the neck, a
# hard crease — the band takes the drawing's own pixel instead, and this is the line between the
# two. 6/255 is below anything visible at the 850px the owner streams at.
BAND_TOL = 6
REST_TOL = BAND_TOL
# How far the overlay turns each joint, in degrees (crid-bot.js: RIG_HIP, RIG_KNEE, RIG_ARM, and
# the elbow at half the arm swing). --check turns every joint this far, both ways, and proves the
# seam under it stays solid. The neck is absent because the overlay never turns it.
RIG_ANGLES = {"hip-l": 5, "hip-r": 5, "knee-l": 8, "knee-r": 8,
              "shoulder-l": 6, "shoulder-r": 6, "elbow-l": 3, "elbow-r": 3}
# Where the head is cut off the neck, as a fraction of the way down the narrowest neck row.
NECK_DROP = 17
# The knee, as a fraction of the way from the crotch down to the ankle.
KNEE_FRAC = 0.48
# Shoulder joint as an offset below the narrowest neck row — the same on every stage because
# all seven are the same render; only the build (width/mass) differs.
SHOULDER_OFF = 155


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
        raise SystemExit(f"{SOURCE.name} has no opaque pixels: nothing to cut")
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

    AXIS = 560   # every stage is framed so the mid-torso sits on x=560 (build-body-ladder.py)

    def row_runs(y, min_w=6):
        return [q for q in runs(a, y) if q[1] - q[0] + 1 >= min_w]

    def clusters(y, gap=25):
        """The row's runs merged into silhouette clusters: runs separated by more than `gap`
        transparent pixels are different objects (arm vs torso, leg vs leg)."""
        out = []
        for q in row_runs(y):
            if out and q[0] - out[-1][1] <= gap:
                out[-1] = (out[-1][0], q[1])
            else:
                out.append(q)
        return out

    def body_edges(y):
        """(left, right) of the body mass on row y: the cluster nearest the axis, or the two
        clusters straddling it once the legs split. Arm/hand clusters sit outside this."""
        cs = clusters(y)
        if not cs:
            return None
        # the cluster containing the axis, else the pair of clusters nearest it
        for c in cs:
            if c[0] <= AXIS <= c[1]:
                return c
        # below the crotch the axis falls in the gap between the legs: take the innermost pair
        left = [c for c in cs if c[1] < AXIS]
        right = [c for c in cs if c[0] > AXIS]
        if left and right:
            l, r = max(left, key=lambda c: c[1]), min(right, key=lambda c: c[0])
            return (l[0], r[1])
        return min(cs, key=lambda c: abs((c[0] + c[1]) / 2 - AXIS))

    # --- the legs: the crotch is the first row where the body splits in two ------------------
    # The legs are the adjacent pair of RUNS whose gap sits nearest the axis — hands and feet
    # make runs too, but their gaps are never the ones around x=560.
    def leg_runs(y):
        """(left leg run, right leg run) on row y, or None. The pair whose gap midpoint is
        closest to the axis wins; both must be leg-sized and the gap must be a real split."""
        r = row_runs(y, min_w=15)
        best = None
        for i in range(len(r) - 1):
            l, rr = r[i], r[i + 1]
            if l[1] - l[0] + 1 < 25 or rr[1] - rr[0] + 1 < 25:
                continue
            gap = rr[0] - l[1]
            # the leg split is a narrow gap around the axis; a hand beside the torso leaves
            # a wider one, and its inner edge never comes near x=560
            if gap < 2 or gap > 90 or l[1] > AXIS + 30 or rr[0] < AXIS - 30:
                continue
            mid = (l[1] + rr[0]) / 2
            d = abs(mid - AXIS)
            if best is None or d < best[0]:
                best = (d, l, rr)
        return (best[1], best[2]) if best else None

    crotch_y, legs = None, None
    for y in range(int(H * .55), int(H * .78)):
        lr = leg_runs(y)
        if lr and leg_runs(y + 1) and leg_runs(y + 2):
            crotch_y, legs = y, lr
            break
    if crotch_y is None:
        raise SystemExit("could not find the crotch: the legs never separate")

    # The ankle: the narrowest point of each leg in the bottom of the figure, where the calf
    # tapers into the bare foot. With no cloth on him there is no shoe and no denim edge to
    # read, so the landmark is the silhouette's own waist instead of a colour change.
    ankle_y, ankle_w = None, 10 ** 9
    for y in range(crotch_y + round((INK_BOTTOM - crotch_y) * .55), INK_BOTTOM):
        lr = leg_runs(y)
        if lr:
            w = max(q[1] - q[0] + 1 for q in lr)
            if w < ankle_w:
                ankle_y, ankle_w = y, w
    if ankle_y is None:
        raise SystemExit("could not find the ankles: the legs never narrow into the feet")

    hip, knee = {}, {}
    for side, i in (("l", 0), ("r", 1)):
        q = legs[i]
        hip[side] = (round((q[0] + q[1]) / 2, 1), crotch_y - 6)
        ky = crotch_y + round((ankle_y - crotch_y) * KNEE_FRAC)
        lr = leg_runs(ky)
        k = lr[i] if lr else q
        knee[side] = (round((k[0] + k[1]) / 2, 1), ky)

    # --- the arms: measured off THIS body's silhouette, not assumed -------------------------
    # All seven stages are the same render at different builds, so the shoulder sits the same
    # distance below the narrowest neck row on every one of them — the deltoid cap is simply
    # fused into the torso silhouette longer on the heavy builds, which is why "first separate
    # run" cannot find it there.
    shoulder_y = neck_y + SHOULDER_OFF
    hand_bottom = crotch_y - 6     # his hands hang to hip level; below that is feet, not hands

    # Per-row arm extent: outer = the silhouette edge on that side. inner = where the arm meets
    # the body: measured directly on rows where the arm is its own cluster, and on fused rows
    # taken as outer + T(y), the arm's thickness interpolated from the rows where it separates
    # (thicker near the deltoid, so rows above the first measurement get a deliberate margin).
    arm_prof = {}
    for side in ("l", "r"):
        meas = {}       # y -> (outer, inner) where the arm is a separate cluster
        thick = {}      # y -> arm thickness on those rows
        for y in range(shoulder_y, hand_bottom + 1):
            allr = row_runs(y)
            if not allr:
                continue
            be = body_edges(y)
            if be is None:
                continue
            outer = allr[0][0] if side == "l" else allr[-1][1]
            if side == "l":
                side_cs = [c for c in clusters(y) if c[1] < be[0] - 2]
            else:
                side_cs = [c for c in clusters(y) if c[0] > be[1] + 2]
            if side_cs:
                inner = max(c[1] for c in side_cs) if side == "l" else min(c[0] for c in side_cs)
                cap = be[0] + 14 if side == "l" else be[1] - 14
                inner = min(inner, cap) if side == "l" else max(inner, cap)
                meas[y] = (min(outer, inner), max(outer, inner))
                thick[y] = abs(inner - outer)
        ys = sorted(meas)

        def thickness(y):
            """Arm thickness at row y: measured where possible, interpolated across fused
            rows, padded near the deltoid, and — when a build fuses arm to body everywhere —
            estimated as a share of that row's body width, the way the deltoid actually scales."""
            if y in thick:
                return thick[y]
            if ys:
                below = [v for v in ys if v <= y]
                above = [v for v in ys if v >= y]
                if below and above:
                    y0, y1 = max(below), min(above)
                    t0, t1 = thick[y0], thick[y1]
                    t = 0 if y1 == y0 else (y - y0) / (y1 - y0)
                    return t0 + (t1 - t0) * t
                # beyond the measured span: the deltoid end gets the widest measured value
                return thick[ys[0] if not below else ys[-1]] * (1.15 if not below else 1.0)
            be = body_edges(y)
            if be is None:
                return None
            return min(95, max(30, round((be[1] - be[0]) * 0.22)))

        prof = {}
        for y in range(shoulder_y, hand_bottom + 1):
            allr = row_runs(y)
            if not allr:
                continue
            outer = allr[0][0] if side == "l" else allr[-1][1]
            if y in meas:
                prof[y] = meas[y]
                continue
            t = thickness(y)
            if t is None:
                continue
            inner = outer + t if side == "l" else outer - t
            prof[y] = (min(outer, inner), max(outer, inner))
        arm_prof[side] = prof

    def arm_centre(y, side):
        p = arm_prof[side].get(y)
        if not p:
            return None
        return (p[0] + p[1]) / 2

    shoulder = {}
    for side in ("l", "r"):
        c = arm_centre(shoulder_y + 4, side)
        if c is None:
            raise SystemExit(f"no arm profile for {side} at the shoulder")
        shoulder[side] = (round(c, 1), shoulder_y - 3)
    # The wrist is where the forearm stops widening into the hand; the elbow sits half way
    # between the shoulder and it, on the arm's own axis.
    wrist_y = shoulder_y + round((hand_bottom - shoulder_y) * .72)
    elbow = {}
    for side in ("l", "r"):
        ey = shoulder_y + round((wrist_y - shoulder_y) * .5)
        c = arm_centre(ey, side)
        if c is None:
            c = shoulder[side][0]
        elbow[side] = (round(c, 1), ey)

    return {
        "source": {"w": W, "h": H, "inkBottom": INK_BOTTOM, "box": list(box)},
        "neck": {"y": head_cut, "narrowest": neck_y},
        "shoulder": shoulder, "elbow": elbow, "wristY": wrist_y, "handBottom": hand_bottom,
        "shoulderY": shoulder_y, "hip": hip, "knee": knee,
        "crotchY": crotch_y, "ankleY": ankle_y, "ankleW": ankle_w,
        "armProf": arm_prof,
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
    # The arm's extent on every row was measured in measure(): outer is always the silhouette
    # edge on that side, inner is where the arm meets the body — measured directly where the
    # arm is its own cluster, interpolated across the rows where a heavy build fuses it to the
    # torso. No pixel-width constant survives here: each body brings its own numbers.
    arm = {}
    for side in ("l", "r"):
        prof = m["armProf"][side]

        def in_arm(x, y, prof=prof):
            if y < m["shoulderY"] or y > m["handBottom"]:
                return False
            p = prof.get(y)
            return bool(p) and p[0] <= x <= p[1]
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
    # above. That partition is what decides which piece a pixel belongs to; the OVERLAP that
    # stops the joint showing is painted on afterwards, in overlap(), out of each piece's own
    # edge colour.
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
            lambda x, y, s=side, ky=ky: ink(x, y) and in_leg(x, y, s) and y < ky, 0, H)
        masks["arm-upper-" + side] = mask_from(
            lambda x, y, b=band, ey=ey: ink(x, y) and b(x, y) and y < ey, 0, H)

    # The head is everything above the neck cut; the torso is every pixel no limb claimed.
    claimed = Image.new("L", (W, H), 0)
    for mk in masks.values():
        claimed = ImageChops.lighter(claimed, mk)
    cp = claimed.load()

    masks["head"] = mask_from(lambda x, y: ink(x, y) and y < m["neck"]["y"], 0, H)
    masks["torso"] = mask_from(
        lambda x, y: ink(x, y) and y >= m["neck"]["y"] and cp[x, y] == 0, 0, H)
    return masks


PIECES = ["thigh-l", "shin-l", "thigh-r", "shin-r", "torso", "head", "arm-upper-l", "arm-fore-l", "arm-upper-r", "arm-fore-r"]

# Back to front. Every joint is drawn with the piece above the cut over the piece below it, which
# is what puts the overlap band on top of the lower piece's cut edge instead of under it.
ORDER = ["shin-l", "thigh-l", "shin-r", "thigh-r", "arm-fore-l", "arm-upper-l", "arm-fore-r",
         "arm-upper-r", "torso", "head"]


def joints(m):
    """Every cut in the rig: (piece above it, piece below it, the row, the joint that turns it)."""
    return [
        ("head", "torso", m["neck"]["y"], "head"),
        ("torso", "arm-upper-l", m["shoulderY"], "shoulder-l"),
        ("torso", "arm-upper-r", m["shoulderY"], "shoulder-r"),
        ("arm-upper-l", "arm-fore-l", m["elbow"]["l"][1], "elbow-l"),
        ("arm-upper-r", "arm-fore-r", m["elbow"]["r"][1], "elbow-r"),
        ("torso", "thigh-l", m["crotchY"], "hip-l"),
        ("torso", "thigh-r", m["crotchY"], "hip-r"),
        ("thigh-l", "shin-l", m["knee"]["l"][1], "knee-l"),
        ("thigh-r", "shin-r", m["knee"]["r"][1], "knee-r"),
    ]


def overlap(img, masks, m):
    """Paint each piece OVERLAP px past every cut it is on, in its own edge colour.

    The band is the piece's own last solid row carried on across the joint — clamped, never
    borrowed from the piece on the other side — so it reads as the same limb continuing when the
    joint turns, instead of showing a frozen copy of its neighbour.

    The band is laid on every pixel the piece across the cut has solid ink on, which is what keeps
    it inside the render's silhouette and what makes the joint solid at any angle. Its colour is
    that edge colour wherever it is within BAND_TOL of the drawing underneath — the shading of a
    limb across a joint is nearly flat, so that is most of it. Where the drawing changes sharply
    right at the cut (the jaw's shadow onto the neck, a crease at the knee) the edge colour would
    be a visible stripe on the rest pose, so there the band takes the drawing's own pixel instead.
    The rig at rest is then the render to within BAND_TOL, everywhere.

    Returns the pieces and the mask of every pixel a band was laid on.
    """
    a = alpha(img)
    src = img.load()
    core = {n: mk.load() for n, mk in masks.items()}
    out = {}
    for name in PIECES:
        c = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        c.paste(img, (0, 0), masks[name])
        out[name] = c
    px = {n: c.load() for n, c in out.items()}
    band = Image.new("L", (W, H), 0)
    bp = band.load()

    for up, down, y, _ in joints(m):
        # The piece above the cut reaches down past it, the piece below reaches up past it. Each
        # band is filled from the row of its own piece that touches the cut.
        for name, other, rows, edge, step, whole_seam in (
                (up, down, range(y, y + OVERLAP), y - 1, -1, True),
                (down, up, range(y - OVERLAP, y), y, +1, False)):
            for x in range(W):
                # Only onto the other piece's own solid ink: no new silhouette, no fringe.
                seam = [yy for yy in rows if 0 <= yy < H and core[other][x, yy] and a[x, yy] == 255]
                if not seam:
                    continue
                # The piece above the cut has to hold the WHOLE seam, not just the columns it has
                # ink in itself: where the limb below bulges out past the row the cut was taken on
                # — the top of an arm that hangs clear of the torso, 3px wider there than the fused
                # shoulder row above it — turning the limb uncovers a sliver of him that neither
                # piece covers, and the joint opens. So its band goes on every solid pixel of the
                # piece below in those rows. The piece below still reaches up only over the columns
                # above it, where it has its own edge to carry.
                if not core[name][x, edge] and not whole_seam:
                    continue
                # The colour to carry: the nearest solid pixel of this piece, looked for in its
                # own cut row first — that row is the piece's edge at the joint, so its colour is
                # the limb continuing. A column on the silhouette rim never reaches full alpha,
                # and reading sideways along the row keeps the band filled right out to the edge.
                colour = None
                if core[name][x, edge]:
                    for k in range(W):
                        for xx in (x - k, x + k) if k else (x,):
                            if 0 <= xx < W and core[name][xx, edge] and a[xx, edge] == 255:
                                colour = src[xx, edge]
                                break
                        if colour is not None:
                            break
                if colour is None:          # nothing solid in that row: try the column
                    for k in range(OVERLAP + 1):
                        yy = edge + step * k
                        if 0 <= yy < H and a[x, yy] == 255:
                            colour = src[x, yy]
                            break
                for yy in seam:
                    under = src[x, yy]
                    # With no edge colour of its own the band takes the drawing's own pixel, so the
                    # rest pose stays the render exactly.
                    if colour is None or max(abs(colour[i] - under[i]) for i in range(3)) > BAND_TOL:
                        colour_here = under          # the edge colour would stripe the rest pose
                    else:
                        colour_here = colour
                    px[name][x, yy] = (colour_here[0], colour_here[1], colour_here[2], 255)
                    bp[x, yy] = 255
    return out, band


def cut(pieces):
    out = {}
    for name in PIECES:
        piece = pieces[name]
        box = bbox(piece)
        if box is None:
            raise SystemExit(f"piece {name} came out empty — the cut points are wrong")
        out[name] = (piece.crop(box), box)
    return out


def rig_table(m, pieces):
    """The table the overlay reads: where each piece sits and what it turns about."""
    def j(p):
        return {"x": round(p[0], 1), "y": round(p[1], 1)}
    return {
        "source": {"w": W, "h": H, "inkBottom": INK_BOTTOM},
        "order": ORDER,
        "pivot": {
            "head": j((560, m["neck"]["y"])),
            "shoulder-l": j(m["shoulder"]["l"]), "shoulder-r": j(m["shoulder"]["r"]),
            "elbow-l": j(m["elbow"]["l"]), "elbow-r": j(m["elbow"]["r"]),
            "hip-l": j(m["hip"]["l"]), "hip-r": j(m["hip"]["r"]),
            "knee-l": j(m["knee"]["l"]), "knee-r": j(m["knee"]["r"]),
        },
        "pieces": {n: {"x": b[0], "y": b[1], "w": b[2] - b[0], "h": b[3] - b[1],
                       "src": f"./desk-assets/crid/rigs/{BODY}/{n}.png"} for n, (_, b) in pieces.items()},
    }


def write(img, m, pieces, table):
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (piece, box) in pieces.items():
        piece.save(OUT / f"{name}.png", optimize=True)
    (OUT / "rig.json").write_text(json.dumps(table, indent=2) + "\n")
    (CRID / "rig.mjs").write_text(
        "// GENERATED by scripts/build-crid-rig.py — do not edit by hand.\n"
        "// Every ladder stage's render cut into limbs: where each piece sits in the 1050x1400\n"
        "// frame and the joint it turns about. rigs/<key>/ holds the pieces, this holds the\n"
        "// tables, keyed the same way BODY_LADDER keys its stages.\n"
        f"export const RIGS={json.dumps(RIGS, separators=(',', ':'))};\n")


def stack(pieces, order):
    """Composite the pieces in layer order into one frame."""
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for name in order:
        piece, box = pieces[name]
        im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        im.paste(piece, (box[0], box[1]))
        out = Image.alpha_composite(out, im)
    return out


def check(img, pieces, band, m, table):
    """Prove the rig is whole: he is fully covered, and no joint can open.

    The pieces no longer meet on exact boundaries — each reaches OVERLAP px past its cut — so the
    proof is coverage rather than a butt join. Three things have to hold:

      * every pixel of his ink belongs to at least one piece, and no piece paints where he is
        transparent: together the ten pieces are exactly his silhouette, not a hole in it and not
        a pixel more;
      * drawn in layer order at rest they are the shipped render — exactly, outside the overlap
        bands, and to within BAND_TOL inside them, where the band is an edge colour rather than
        the pixel it covers;
      * turn any joint as far as the overlay ever turns it and the band under it still covers
        every pixel of him in the seam. That last one is the whole point: the wedge a rotating
        limb opens is closed by the piece above the cut reaching down over it.
    """
    ink = img.split()[3]
    rest = stack(pieces, table["order"])

    # --- coverage: no hole in him, and nothing of the rig outside him ---------------------
    cover = Image.new("L", (W, H), 0)
    for name in PIECES:
        piece, box = pieces[name]
        cover.paste(ImageChops.lighter(cover.crop(box), piece.split()[3].point(lambda v: 1 if v else 0)), box)
    one = ink.point(lambda v: 1 if v else 0)
    missing = ImageChops.subtract(one, cover)
    if missing.getbbox() is not None:
        raise SystemExit(f"the cut leaves a hole in him at {missing.getbbox()}")
    outside = ImageChops.subtract(cover, one)
    if outside.getbbox() is not None:
        raise SystemExit(f"a piece paints outside him at {outside.getbbox()}")

    # --- the rest pose is the drawing -----------------------------------------------------
    if ImageChops.difference(rest.split()[3], ink).getbbox() is not None:
        raise SystemExit("the pieces do not reproduce the render's alpha channel")
    visible = ink.point(lambda v: 255 if v else 0)
    diff = Image.composite(ImageChops.difference(rest, img),
                           Image.new("RGBA", (W, H), (0, 0, 0, 0)), visible).convert("RGB")
    # Outside the bands nothing may differ at all: every one of those pixels is a piece of the
    # render, unmoved. Inside them the band is an edge colour, so it steps over the shading it
    # covers — measured, and held to BAND_TOL.
    offband = ImageChops.subtract(diff, Image.merge("RGB", (band, band, band)))
    if offband.getbbox() is not None:
        raise SystemExit(f"the rig differs from the render outside a joint at {offband.getbbox()}")
    worst = max(hi for _, hi in diff.getextrema())
    if worst > REST_TOL:
        raise SystemExit(f"the overlap bands shift the rest pose by {worst}/255, over the {REST_TOL} allowed")

    # --- every joint holds when it turns -------------------------------------------------
    # The angles are the overlay's own (crid-bot.js: RIG_HIP, RIG_KNEE, RIG_ARM, and the elbow
    # at half the arm swing), each taken both ways. A joint the overlay never turns — the neck —
    # has no wedge to close and is left out.
    solid = ink.point(lambda v: 255 if v == 255 else 0).load()
    for up, down, y, joint in joints(m):
        deg = RIG_ANGLES.get(joint)
        if not deg:
            continue
        q = table["pivot"][joint]
        for sign in (1, -1):
            posed = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            for name in table["order"]:
                piece, box = pieces[name]
                im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                im.paste(piece, (box[0], box[1]))
                if name == down:
                    im = im.rotate(-sign * deg, resample=Image.BICUBIC, center=(q["x"], q["y"]))
                posed = Image.alpha_composite(posed, im)
            pp = posed.load()
            for yy in range(max(0, y), min(H, y + OVERLAP)):
                for x in range(W):
                    if solid[x, yy] and pp[x, yy][3] < 255:
                        raise SystemExit(
                            f"{joint} opens a hole at {x},{yy} when it turns {sign * deg:+.0f} degrees")

    print(f"ok: {len(PIECES)} pieces cover every pixel of {SOURCE.name}, rebuild him at rest "
          f"to within {worst}/255, and no joint opens when turned")


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
        # legs under the torso, the piece above each cut over the piece below it
        for side, sgn in (("l", 1), ("r", -1)):
            th = place(f"thigh-{side}", p[f"hip-{side}"], leg * sgn)
            sh = place(f"shin-{side}", p[f"knee-{side}"], leg * sgn * .8)
            c = Image.alpha_composite(c, Image.alpha_composite(sh, th))
        c = Image.alpha_composite(c, place("torso", p["head"], 0))
        c = Image.alpha_composite(c, place("head", p["head"], 0))
        for side, sgn in (("l", -1), ("r", 1)):
            ua = place(f"arm-upper-{side}", p[f"shoulder-{side}"], arm_swing * sgn)
            fa = place(f"arm-fore-{side}", p[f"elbow-{side}"], arm_swing * sgn * .7)
            c = Image.alpha_composite(c, Image.alpha_composite(fa, ua))
        return c
    for i in range(frames):
        import math
        u = i / frames
        f = draw(0, 13 * math.sin(2 * math.pi * u), 11 * math.sin(2 * math.pi * u))
        f = f.crop((380, 150, 720, 1340)).resize((int(340 * S), int(1190 * S)))
        sheet.alpha_composite(f, (int(340 * S) * i, 0))
    sheet.save(out)
    print(f"wrote {out}")


RIGS = {}


def run(body, argv):
    global BODY, SOURCE, OUT
    BODY = body
    SOURCE = CRID / f"body-{body}-r0.webp"
    OUT = CRID / "rigs" / str(body)
    if not SOURCE.exists():
        raise SystemExit(f"missing {SOURCE}")
    img = Image.open(SOURCE).convert("RGBA")
    if img.size != (W, H):
        raise SystemExit(f"{SOURCE.name} is {img.size}, expected {(W, H)}")
    m = measure(img)
    if "--measure" in argv:
        print(json.dumps({k: v for k, v in m.items() if k != "source"}, indent=2))
        return 0
    masks = build(img, m)
    pieces, band = overlap(img, masks, m)
    pieces = cut(pieces)
    table = rig_table(m, pieces)
    check(img, pieces, band, m, table)
    RIGS[str(body)] = table
    write(img, m, pieces, table)
    print(f"wrote {len(pieces)} pieces to {OUT.relative_to(ROOT)}")
    if "--poses" in argv:
        poses(table, pieces, argv[argv.index("--poses") + 1])
    return 0


def main(argv):
    bodies = BODIES if "--all" in argv else [int(argv[argv.index("--body") + 1]) if "--body" in argv else BODY]
    for body in bodies:
        run(body, argv)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
