#!/usr/bin/env python3
"""Build Crid's body ladder out of Snap's own renderer, at rotation 0.

WHY THIS WAS REBUILT
--------------------
The original r7 ladder mixed camera angles, straps and inconsistent head proportions. The owner
selected `body-000-r7.webp` as the exact leanest look and face. That file is now the canonical first
stage and is copied byte-for-byte into production. The other six stages use Snap's distinct
front-facing body values, ordered lean -> heavy:

    body=3  leanest    body=0  lean    body=4  light    body=5  average
    body=1  full       body=11 heavy   body=2  heaviest

The six heavier frames inherit the exact head/face crop from the selected r7 image. Their bodies are
aligned to its measured torso axis and floor, then widened deterministically to the historical ink
widths. The head is never scaled or redrawn.

WHERE THE FRAMES COME FROM
--------------------------
`--fetch` asks preview.bitmoji.com/bm-preview/v3/avatar/body — the endpoint the owner's own
avatar URL uses (scripts/fetch-crid-views.mjs in the CRID archive) — at scale=2, rotation=0,
for the seven distinct builds, masters downscaled to 1050x1400. The selected leanest image is not regenerated: `body-000-r7.webp` at the exact source commit in
FACE_REFERENCE is the canonical first stage. The other six builds are fetched from the same Snap
recipe at rotation=0, with `body` changed and the backpack removed (`bag=-1`). Their head crop
is replaced by the exact pixels from the selected r7 image. The bag remains a separate prop.

FRAMING (what crid-bot.js assumes: INK_BOTTOM, FIG_X, FIG_Y)
-----------------------------------------------------------
The r7 lean reference is already 1050x1400 with its ink bottom at y=1325. It is the immutable
canonical frame: do not recenter, resize or redraw it. Each of the other six Snap renders is
translated onto its measured torso axis and the same floor, then receives the exact r7 head crop.
The historical widths (307..822 px) are targets; ink height is measured per stage, not fabricated
or forced to a stale shared value.

Needs Pillow (not a runtime dependency — this is a one-off asset tool):
  python3 -m pip install pillow

  python3 scripts/build-body-ladder.py --fetch    # download the seven masters from Snap
  python3 scripts/build-body-ladder.py            # frame + measure: frames, ladder.json
  python3 scripts/build-body-ladder.py --measure  # print the ink box of every shipped frame
  python3 scripts/build-body-ladder.py --sheet OUT.png   # comparison sheet at 336px and 150px
"""
import json
import shutil
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
# Historical r7 measured ink widths, mapped to the seven current front-facing body builds.
WIDTH_TARGETS = [307, 366, 420, 486, 560, 676, 822]
HEAD_LOCK_BOTTOM = 450
HEAD_BLEND = 100
LEG_TAPER = 0.35
FACE_REFERENCE = {"url":"https://github.com/hisiaq1234/cyber-live-desk/blob/cc1902269b6d36a4d086af3f67241af79a5bcbb0/public/desk-assets/crid/body-000-r7.webp","source_commit":"cc1902269b6d36a4d086af3f67241af79a5bcbb0","source_path":"public/desk-assets/crid/body-000-r7.webp"}
WIDTH_REFERENCE = {"source_commit":"cc1902269b6d36a4d086af3f67241af79a5bcbb0","source_path":"public/desk-assets/crid/ladder.json","measured_widths":[307,366,420,486,560,676,822]}


# The Snap recipe — the owner's own avatar URL (fetch-crid-views.mjs in the CRID archive), with
# `body` filled per stage by query() and the backpack taken off (`bag=-1`, its tones dropped with
# it): the bag is a prop, not clothing. Everything else is verbatim — trousers, socks, shoes,
# the gold hoops, the whole face. Tones are decimal integers: the endpoint answers 400 to 0x…
# values. `scale` is overridden per request in query() — the fetch is a 2100x2800 master.
API = "https://preview.bitmoji.com/bm-preview/v3/avatar/body"
RECIPE = (
    "scale=2 gender=1 style=5 rotation=0 bag=-1 beard=2212 body=0 bottom=10001984 bottom_tone1=0 bottom_tone10=0 bottom_tone2=0 bottom_tone3=0 bottom_tone4=0 bottom_tone5=0 bottom_tone6=0 bottom_tone7=0 bottom_tone8=0 bottom_tone9=0 breast=0 brow=1555 brow_tone=1579802 cheek_details=1356 clothing_type=1 ear=1423 earringL_lobe1=5 earringL_lobe1_tone1=16763909 earringL_lobe1_tone2=16763909 earringL_lobe1_tone3=16763909 earringL_lobe1_tone4=16763909 earringR_lobe1=5 earringR_lobe1_tone1=16763909 earringR_lobe1_tone2=16763909 earringR_lobe1_tone3=16763909 earringR_lobe1_tone4=16763909 eye=1614 eyelash=-1 eye_details=1352 eye_size=2 eye_spacing=0 face_lines=1366 face_proportion=13 footwear=866 footwear_tone1=16448250 footwear_tone10=16448250 footwear_tone2=16448250 footwear_tone3=16448250 footwear_tone4=16448250 footwear_tone5=16448250 footwear_tone6=16448250 footwear_tone7=16448250 footwear_tone8=16448250 footwear_tone9=16448250 glasses=-1 hair=1657 hair_tone=2566954 hat=-1 hat_tone1=10626095 hat_tone2=10626095 hat_tone3=10626095 hat_tone4=10626095 hat_tone5=10626095 hat_tone6=10626095 hat_tone7=10626095 hat_tone8=10626095 hat_tone9=10626095 is_tucked=0 jaw=1392 mouth=2337 nose=1482 pupil_tone=5977116 skin_tone=9657655 sock=295 sock_tone1=1907997 sock_tone2=8158331 sock_tone3=15132132 sock_tone4=1907997 ua=2 beard_tone=1579802 blush_tone=16754088 hair_treatment_tone=3353384 lipstick_tone=16740668"
)


# --- measuring -----------------------------------------------------------------------------
def alpha_bbox(im):
    a = im.getchannel("A").point(lambda v: 255 if v > ALPHA_MIN else 0)
    return a.getbbox()


def ink(im):
    x0, y0, x1, y1 = alpha_bbox(im)
    area = sum(im.getchannel("A").histogram()[ALPHA_MIN + 1:])
    return {"x0": x0, "y0": y0, "x1": x1, "y1": y1, "w": x1 - x0, "h": y1 - y0,
            "cx": round((x0 + x1) / 2, 1), "bottom": y1, "area": area}


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
    # The user selected this exact archived frame as Crid's leanest look. Preserve its
    # original WebP bytes and decode it losslessly to the PNG master used by the builder.
    reference_url = (
        "https://raw.githubusercontent.com/hisiaq1234/cyber-live-desk/"
        + FACE_REFERENCE["source_commit"] + "/" + FACE_REFERENCE["source_path"]
    )
    req = urllib.request.Request(reference_url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=90) as r:
        reference_data = r.read()
    reference_file = VIEWS / "body-000-r7.webp"
    reference_file.write_bytes(reference_data)
    reference = Image.open(__import__("io").BytesIO(reference_data)).convert("RGBA")
    if reference.size != (FRAME_W, FRAME_H):
        raise SystemExit(f"approved body-000-r7 reference is {reference.size}, expected {(FRAME_W, FRAME_H)}")
    print(f"body-000-r7 exact reference -> {(VIEWS / 'body-000-r7.webp').relative_to(ROOT)}")

    for body in BODIES[1:]:
        url = API + "?" + urllib.parse.urlencode(query(body))
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=90) as r:
            data = r.read()
            ctype = r.headers.get("content-type")
        if not ctype.startswith("image"):
            raise SystemExit(f"body={body}: the API answered {ctype!r}, not an image")
        im = Image.open(__import__("io").BytesIO(data)).convert("RGBA")
        if im.size != (FRAME_W, FRAME_H):
            im = im.resize((FRAME_W, FRAME_H), Image.LANCZOS)
        p = VIEWS / f"body-{body}-r0.png"
        im.save(p)
        print(f"body={body}  {ctype}  {len(data) / 1024:.0f} KB  -> {p.relative_to(ROOT)}")


# --- framing -------------------------------------------------------------------------------
def master(body):
    p = (VIEWS / "body-000-r7.webp" if body == BODIES[0]
         else VIEWS / f"body-{body}-r0.png")
    if not p.exists():
        raise SystemExit(f"missing {p.relative_to(ROOT)} — run with --fetch first")
    im = Image.open(p).convert("RGBA")
    if im.size != (FRAME_W, FRAME_H):
        raise SystemExit(f"{p.name} is {im.size}, expected {(FRAME_W, FRAME_H)}")
    return im


def frame(im, dx, dy):
    canvas = Image.new("RGBA", (FRAME_W, FRAME_H), (0, 0, 0, 0))
    canvas.paste(im, (int(round(dx)), int(round(dy))))
    return canvas



def smoothstep(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3.0 - 2.0 * t)


def body_profile(y):
    if y < HEAD_LOCK_BOTTOM:
        return 0.0
    if y < HEAD_LOCK_BOTTOM + HEAD_BLEND:
        return smoothstep((y - HEAD_LOCK_BOTTOM) / HEAD_BLEND)
    taper_start = GROUND - 180
    if y <= taper_start:
        return 1.0
    return 1.0 - LEG_TAPER * smoothstep((y - taper_start) / max(1, GROUND - taper_start))


def lock_head(canonical, current):
    out = current.copy()
    out.paste(canonical.crop((0, 0, FRAME_W, HEAD_LOCK_BOTTOM)), (0, 0))
    for y in range(HEAD_LOCK_BOTTOM, min(FRAME_H, HEAD_LOCK_BOTTOM + HEAD_BLEND)):
        t = smoothstep((y - HEAD_LOCK_BOTTOM) / HEAD_BLEND)
        out.paste(Image.blend(canonical.crop((0, y, FRAME_W, y + 1)), out.crop((0, y, FRAME_W, y + 1)), t), (0, y))
    return out


def warp_rows(im, scale, axis=AXIS):
    out = Image.new("RGBA", im.size, (0, 0, 0, 0))
    for y in range(FRAME_H):
        k = 1.0 + (scale - 1.0) * body_profile(y)
        row = im.crop((0, y, FRAME_W, y + 1))
        if abs(k - 1.0) > 0.0001:
            inv = 1.0 / k
            row = row.transform((FRAME_W, 1), Image.Transform.AFFINE,
                                (inv, 0, axis * (1.0 - inv), 0, 1, 0),
                                resample=Image.Resampling.BICUBIC)
        out.paste(row, (0, y))
    return out


def warp_to_width(im, target, axis=AXIS):
    head_w = ink(im.crop((0, 0, FRAME_W, HEAD_LOCK_BOTTOM)))["w"]
    if target <= head_w + 4:
        raise RuntimeError(f"target width {target} is smaller than locked head width {head_w}")
    scale = target / max(1, ink(im)["w"])
    out = im
    for _ in range(10):
        out = warp_rows(im, scale, axis)
        actual = ink(out)["w"]
        if abs(actual - target) <= 2:
            return out
        if actual <= head_w:
            raise RuntimeError(f"body width collapsed under head: {actual} <= {head_w}")
        scale *= target / max(1, actual)
    raise RuntimeError(f"could not reach target width {target}; got {ink(out)['w']}")


def write_runtime_module(stages, axis):
    rows = [
        '  Object.freeze({key: "%s", w: %d, h: %d, slow: %.3f, heft: %.3f, girth: %.3f})'
        % (s["key"], s["ink"]["w"], s["ink"]["h"], s["slow"], s["heft"], s["girth"])
        for s in stages
    ]
    module = (
        "// Generated by scripts/build-body-ladder.py. Do not edit by hand.\n"
        "export const FRAME = Object.freeze({w: %d, h: %d, ground: %d, axis: %.1f});\n"
        "export const BODY_LADDER = Object.freeze([\n%s\n]);\n"
        "export const bodyForKey = key => BODY_LADDER.find(s => s.key === String(key)) || BODY_LADDER[0];\n"
        % (FRAME_W, FRAME_H, GROUND, axis, ",\n".join(rows))
    )
    (CRID / "ladder.mjs").write_text(module, encoding="utf-8")


def build_all():
    masters = {b: master(b) for b in BODIES}
    # The selected r7 file itself is the canonical leanest stage. Never re-render,
    # translate, scale or redraw its face/body pixels.
    canonical = masters[BODIES[0]].copy()
    if ink(canonical)["w"] != WIDTH_TARGETS[0] or ink(canonical)["bottom"] != GROUND:
        raise RuntimeError(f"approved r7 reference measurements changed: {ink(canonical)}")
    canonical_axis = mid_torso_axis(canonical)
    stages, areas = [], []
    for i, body in enumerate(BODIES):
        target_w = WIDTH_TARGETS[i]
        if body == BODIES[0]:
            out = canonical.copy()
        else:
            source = masters[body]
            dx = int(round(canonical_axis - mid_torso_axis(source)))
            dy = GROUND - ink(source)["bottom"]
            current = frame(source, dx, dy)
            out = lock_head(canonical, current)
            out = warp_to_width(out, target_w, canonical_axis)
        m = ink(out)
        if abs(m["w"] - target_w) > 2:
            raise RuntimeError(f"body {body}: expected width {target_w}, got {m['w']}")
        if m["bottom"] != GROUND:
            raise RuntimeError(f"body {body}: floor drift {m}")
        if abs(mid_torso_axis(out) - canonical_axis) > 3:
            raise RuntimeError(f"body {body}: torso axis drift {mid_torso_axis(out):.1f} (canonical {canonical_axis:.1f})")
        if out.crop((0, 0, FRAME_W, HEAD_LOCK_BOTTOM)).tobytes() != canonical.crop((0, 0, FRAME_W, HEAD_LOCK_BOTTOM)).tobytes():
            raise RuntimeError(f"body {body}: head/face pixels differ from canonical")
        webp = CRID / f"body-{body}-r0.webp"
        if body == BODIES[0]:
            # Preserve the user's selected leanest image byte-for-byte in production.
            shutil.copyfile(VIEWS / "body-000-r7.webp", webp)
        else:
            out.save(webp, "WEBP", quality=95, method=6)
        t = (target_w - WIDTH_TARGETS[0]) / (WIDTH_TARGETS[-1] - WIDTH_TARGETS[0])
        slow, heft, girth = round(1 + .45*t, 3), round(.86 + .59*t, 3), round(.72 + t, 3)
        stages.append({"key":str(body),"name":BODY_NAMES[body],"file":webp.name,"ink":m,
                       "was":ink(masters[body]),"area":m["area"],"target_width":target_w,
                       "slow":slow,"heft":heft,"girth":girth})
        areas.append(m["area"])
    if any(b <= a for a, b in zip(areas, areas[1:])):
        raise RuntimeError(f"body area must increase at every stage: {areas}")
    diffs = [{"from":stages[i]["key"],"to":stages[i+1]["key"],
              "dw":stages[i+1]["ink"]["w"]-stages[i]["ink"]["w"],
              "dh":stages[i+1]["ink"]["h"]-stages[i]["ink"]["h"]}
             for i in range(len(stages)-1)]
    doc = {"frame":{"w":FRAME_W,"h":FRAME_H},"ground":GROUND,"axis":round(canonical_axis,1),"rotation":0,
           "head_lock_bottom":HEAD_LOCK_BOTTOM,"face_reference":FACE_REFERENCE,
           "width_reference":WIDTH_REFERENCE,"width_targets":WIDTH_TARGETS,
           "min_step":{"w":min(d["dw"] for d in diffs),"h":min(d["dh"] for d in diffs)},
           "stages":stages,"diffs":diffs}
    (CRID / "ladder.json").write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8")
    write_runtime_module(stages, canonical_axis)
    print(json.dumps({"min_step":doc["min_step"],"axis":doc["axis"],"stages":stages},indent=2))



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
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
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
