"""Generate pattern.svg: a "flow poles" background.

A ring of poles alternating between vortex and sink, each turning the flow
around itself with a 1/r falloff, drawn as evenly spaced streamlines
(Jobard & Lefer 1997). Run: python3 tools/gen_pattern.py > pattern.svg
"""
import math

W, H = 420, 900
CX, CY, RING, POLES = W * 0.5, H * 0.62, W * 0.34, 6
D_SEP = 13.0          # spacing between streamlines
D_TEST = D_SEP * 0.5  # how close a line may approach another before stopping
STEP = 1.5
MAX_STEPS = 4000

poles = [
    (CX + RING * math.cos(a), CY + RING * math.sin(a), i % 2)
    for i in range(POLES)
    for a in [2 * math.pi * i / POLES - math.pi / 2]
]


def field(x, y):
    vx = vy = 0.0
    for px, py, kind in poles:
        dx, dy = x - px, y - py
        r2 = dx * dx + dy * dy + 1e-9
        if kind == 0:   # vortex: rotate around the pole
            vx, vy = vx - dy / r2, vy + dx / r2
        else:           # sink: pull toward the pole
            vx, vy = vx - dx / r2, vy - dy / r2
    n = math.hypot(vx, vy)
    return (vx / n, vy / n) if n > 1e-12 else None


grid = {}  # cell -> list of (x, y, line_id)


def cell(x, y):
    return int(x // D_SEP), int(y // D_SEP)


def too_close(x, y, dist, line_id=None, skip_tail=0, own=()):
    cx, cy = cell(x, y)
    for i in (-1, 0, 1):
        for j in (-1, 0, 1):
            for qx, qy, lid in grid.get((cx + i, cy + j), ()):
                if (qx - x) ** 2 + (qy - y) ** 2 < dist * dist:
                    if lid != line_id:
                        return True
    # self-approach (closed vortex loops), ignoring the recent tail
    for qx, qy in own[:-skip_tail] if skip_tail else own:
        if (qx - x) ** 2 + (qy - y) ** 2 < dist * dist:
            return True
    return False


def near_pole(x, y):
    return any((x - px) ** 2 + (y - py) ** 2 < 36 for px, py, _ in poles)


def trace(x0, y0, line_id):
    halves = []
    for sign in (1, -1):
        pts, x, y = [], x0, y0
        for _ in range(MAX_STEPS):
            v = field(x, y)
            if v is None:
                break
            # midpoint (RK2) step
            mx, my = x + sign * v[0] * STEP / 2, y + sign * v[1] * STEP / 2
            v2 = field(mx, my)
            if v2 is None:
                break
            x, y = x + sign * v2[0] * STEP, y + sign * v2[1] * STEP
            if not (-20 < x < W + 20 and -20 < y < H + 20) or near_pole(x, y):
                break
            own = halves[0] + pts if halves else pts
            if too_close(x, y, D_TEST, line_id, skip_tail=int(3 * D_SEP / STEP), own=own[-2000:]):
                break
            pts.append((x, y))
        halves.append(pts)
    return halves[1][::-1] + [(x0, y0)] + halves[0]


lines = []


def add_line(pts, line_id):
    lines.append(pts)
    for x, y in pts:
        grid.setdefault(cell(x, y), []).append((x, y, line_id))


def grow(queue):
    qi = 0
    while qi < len(queue):
        sx, sy = queue[qi]
        qi += 1
        if too_close(sx, sy, D_SEP * 0.95) or near_pole(sx, sy):
            continue
        pts = trace(sx, sy, len(lines))
        if len(pts) < 12:
            continue
        add_line(pts, len(lines))
        # new seeds at D_SEP on either side of this line
        for k in range(0, len(pts) - 1, 4):
            (x1, y1), (x2, y2) = pts[k], pts[k + 1]
            dx, dy = x2 - x1, y2 - y1
            n = math.hypot(dx, dy) or 1
            for s in (1, -1):
                queue.append((x1 - s * dy / n * D_SEP, y1 + s * dx / n * D_SEP))


grow([(W * 0.13, H * 0.1)])
# fill gaps the front never reached, until a pass adds nothing
while True:
    before = len(lines)
    grow([(gx, gy) for gx in range(0, W, int(D_SEP)) for gy in range(0, H, int(D_SEP))])
    if len(lines) == before:
        break


def path(pts):
    pts = pts[::3] + [pts[-1]]
    head = f"M{pts[0][0]:.0f} {pts[0][1]:.0f}"
    return head + "".join(f"L{x:.0f} {y:.0f}" for x, y in pts[1:])


print(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid slice">')
print('<path fill="none" stroke="#000" stroke-width=".6" stroke-linecap="round" d="')
print("\n".join(path(p) for p in lines))
print('"/></svg>')
