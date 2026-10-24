# README diagrams in the manual-kit theme: how a manual is made, and how it keeps up with the code.
# Writes how-it-works.svg and keep-current.svg here; export.mjs turns them into the PNGs the README shows.
# Usage: python3 docs/diagrams/make.py
import math
from pathlib import Path

HERE = Path(__file__).parent
PAPER, INK, MUTED, SOFT = '#ffffff', '#18202b', '#5b6b82', '#8a97a8'
BRAND, BRAND_SOFT, LINE = '#183b5e', '#eef3f8', '#d5dde6'
ACCENT, ACCENT_TINT = '#d9480f', '#fdf0ea'
SANS = "'IBM Plex Sans Thai', 'Thonburi', sans-serif"
MONO = "Menlo, 'SF Mono', monospace"


def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def svg(slug, w, h, title, desc, body):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" aria-labelledby="{slug}-title {slug}-desc">
<title id="{slug}-title">{esc(title)}</title>
<desc id="{slug}-desc">{esc(desc)}</desc>
<defs>
<marker id="{slug}-arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="{MUTED}"/></marker>
<marker id="{slug}-arrow-accent" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="{ACCENT}"/></marker>
<marker id="{slug}-arrow-soft" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="{SOFT}"/></marker>
</defs>
<rect width="100%" height="100%" fill="{PAPER}"/>
{body}
</svg>
'''


def text(x, y, s, size=14, weight=400, fill=INK, anchor='middle', family=SANS):
    return f'<text x="{x}" y="{y}" fill="{fill}" font-size="{size}" font-weight="{weight}" font-family="{family}" text-anchor="{anchor}">{esc(s)}</text>'


def node(x, y, w, h, name, sub, kind='step', sub_mono=False):
    """kind: step (white, brand stroke), input (soft fill), output (brand fill), focal (accent)."""
    fill, stroke, name_c, sub_c = {
        'step': (PAPER, BRAND, INK, MUTED),
        'input': (BRAND_SOFT, LINE, INK, MUTED),
        'output': (BRAND, BRAND, '#ffffff', '#c9d6e3'),
        'focal': (ACCENT_TINT, ACCENT, ACCENT, '#8a3a17'),
    }[kind]
    cx = x + w / 2
    cy = y + h / 2
    out = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" fill="{PAPER}"/>',
           f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" fill="{fill}" stroke="{stroke}" stroke-width="{1.6 if kind == "focal" else 1}"/>']
    if sub:
        out.append(text(cx, cy - 2, name, 16, 600, name_c))
        out.append(text(cx, cy + 18, sub, 12, 400, sub_c, family=MONO if sub_mono else SANS))
    else:
        out.append(text(cx, cy + 6, name, 16, 600, name_c))
    return '\n'.join(out)


def path(d, slug, kind='muted', dash=False):
    color, marker = {'muted': (MUTED, 'arrow'), 'accent': (ACCENT, 'arrow-accent'), 'soft': (SOFT, 'arrow-soft')}[kind]
    da = ' stroke-dasharray="5,4"' if dash else ''
    return f'<path d="{d}" fill="none" stroke="{color}" stroke-width="1.4"{da} marker-end="url(#{slug}-{marker})"/>'


def label(cx, cy, s, w, ground=PAPER):
    """An arrow label on an opaque mask of the ground colour; (cx, cy) is the mask centre."""
    return (f'<rect x="{cx - w / 2}" y="{cy - 10}" width="{w}" height="20" rx="2" fill="{ground}"/>'
            + text(cx, cy + 4, s, 12, 500, MUTED))


# ---------- 1. how a manual is made ----------
def how_it_works():
    slug = 'how-it-works'
    W, H = 1216, 404
    b = []
    # zones: what Claude does with manual-kit, and what a person does
    b.append(f'<rect x="284" y="64" width="464" height="300" rx="8" fill="{BRAND_SOFT}" stroke="{LINE}"/>')
    b.append(f'<rect x="764" y="64" width="220" height="300" rx="8" fill="{PAPER}" stroke="{ACCENT}" stroke-opacity="0.35" stroke-dasharray="4,3"/>')
    b.append(text(144, 44, 'อ่านจากโครงการ', 14, 600, MUTED))
    b.append(text(516, 44, 'Claude ทำด้วย manual-kit', 14, 600, BRAND))
    b.append(text(874, 44, 'คนในทีม', 14, 600, ACCENT))
    b.append(text(1100, 44, 'ได้คู่มือ', 14, 600, MUTED))
    # connectors first
    b.append(path('M248 132 H388 Q396 132 396 140 V156', slug))                       # code -> spec (top)
    b.append(path('M248 284 H628 Q636 284 636 276 V244', slug))                       # app -> pages (bottom)
    b.append(label(440, 304, 'ถ่ายภาพหน้าจอ', 104, BRAND_SOFT))
    b.append(path('M488 200 H536', slug))                                             # spec -> pages
    b.append(path('M728 200 H776', slug))                                             # pages -> review
    b.append(path('M876 236 V320 Q876 328 868 328 H672 Q664 328 664 320 V244', slug, 'soft', dash=True))  # fix and recheck
    b.append(label(820, 344, 'แก้แล้วตรวจใหม่', 108))
    b.append(path('M968 184 H992 Q1000 184 1000 176 V112 Q1000 104 1008 104 H1036', slug))   # -> PDF
    b.append(path('M968 200 H1036', slug))                                                   # -> Word
    b.append(path('M968 216 H992 Q1000 216 1000 224 V288 Q1000 296 1008 296 H1036', slug))   # -> web
    # nodes
    b.append(node(40, 96, 208, 72, 'โค้ดและเอกสาร', 'README · SRS · routes', 'input', sub_mono=True))
    b.append(node(40, 248, 208, 72, 'ระบบที่รันอยู่', 'ใช้ข้อมูลสมมติ', 'input'))
    b.append(node(304, 164, 184, 72, 'สเปกคู่มือ', 'manual-spec.md', 'step', sub_mono=True))
    b.append(node(544, 164, 184, 72, 'หน้าคู่มือและภาพ', 'pages/ · media/', 'step', sub_mono=True))
    b.append(node(784, 164, 184, 72, 'อ่านทวนแล้วรับรอง', 'check · sign', 'focal', sub_mono=True))
    b.append(node(1044, 76, 136, 56, 'PDF', 'ทางการ พร้อมพิมพ์', 'output'))
    b.append(node(1044, 172, 136, 56, 'Word', 'แก้ไขต่อได้', 'output'))
    b.append(node(1044, 268, 136, 56, 'เว็บคู่มือ', 'ค้นหาไทย · มือถือ', 'output'))
    b.append(text(516, 388, 'ทุกข้อในสเปกบอกไฟล์ต้นทาง ภาพถ่ายจากระบบจริง ปิดบังข้อมูลส่วนตัว', 13, 400, MUTED))
    return slug, svg(slug, W, H, 'manual-kit ทำคู่มืออย่างไร',
                     'Claude อ่านโค้ดและเอกสารของโครงการ เขียนสเปกคู่มือ เขียนหน้าและถ่ายภาพจากระบบที่รันด้วยข้อมูลสมมติ คนในทีมอ่านทวนและรับรอง แล้วได้คู่มือเป็น PDF, Word และเว็บ',
                     '\n'.join(b))


# ---------- 2. keeping up with the code (loop) ----------
def keep_current():
    slug = 'keep-current'
    stations = [
        ('โค้ดเปลี่ยน', 'merge request ใหม่', False, False),
        ('manual-kit check', 'หาหน้าที่ไม่ตรงระบบ', True, False),
        ('/manual update', 'แก้เฉพาะหน้าที่กระทบ', False, False),
        ('ถ่ายภาพใหม่', 'capture --changed', False, True),
        ('คนอ่านแล้วรับรอง', 'manual-kit sign', False, False),
        ('ออกไฟล์ใหม่', 'PDF · Word · เว็บ', False, False),
    ]
    N = len(stations)
    sw, sh, hw, hh, R = 200, 68, 220, 96, 236
    cx, cy = 560, 344
    W, H = 1120, 688
    a, bb, A, B = sw / 2, sh / 2, hw / 2, hh / 2
    centers = []
    for k in range(N):
        t = math.radians(-90 + k * 360 / N)
        centers.append((round((cx + R * math.cos(t)) / 4) * 4, round((cy + R * math.sin(t)) / 4) * 4, t))

    def circle_box(k):
        """Intersections of the ring with station k's box, as polar angles."""
        x0, y0, _ = centers[k]
        L, Rt, T, Bt = x0 - a, x0 + a, y0 - bb, y0 + bb
        pts = []
        for xe in (L, Rt):
            d = R * R - (xe - cx) ** 2
            if d >= 0:
                for s in (1, -1):
                    y = cy + s * math.sqrt(d)
                    if T <= y <= Bt:
                        pts.append((xe, y))
        for ye in (T, Bt):
            d = R * R - (ye - cy) ** 2
            if d >= 0:
                for s in (1, -1):
                    x = cx + s * math.sqrt(d)
                    if L <= x <= Rt:
                        pts.append((x, ye))
        return [math.atan2(y - cy, x - cx) for x, y in pts]

    def norm(phi, ref):
        while phi < ref - math.pi:
            phi += 2 * math.pi
        while phi > ref + math.pi:
            phi -= 2 * math.pi
        return phi

    b = []
    for k in range(N):
        j = (k + 1) % N
        tk = centers[k][2]
        tj = centers[j][2] if j else centers[0][2] + 2 * math.pi
        exit_k = max(norm(p, tk) for p in circle_box(k))
        entry_j = min(norm(p, tj) for p in circle_box(j))
        end = entry_j - 1.2 / R
        x1, y1 = cx + R * math.cos(exit_k), cy + R * math.sin(exit_k)
        x2, y2 = cx + R * math.cos(end), cy + R * math.sin(end)
        b.append(path(f'M{x1:.3f} {y1:.3f} A{R} {R} 0 0 1 {x2:.3f} {y2:.3f}', slug))
    # write-back spokes into the manual folder
    for k in range(N):
        x0, y0, t = centers[k]
        u = (math.cos(t), math.sin(t))
        def dist(hx, hy):
            return min(hx / abs(u[0]) if abs(u[0]) > 1e-9 else 1e9, hy / abs(u[1]) if abs(u[1]) > 1e-9 else 1e9)
        ds, dh = dist(a, bb), dist(A, B)
        sx, sy = x0 - ds * u[0], y0 - ds * u[1]
        ex, ey = cx + (dh + 6) * u[0], cy + (dh + 6) * u[1]
        if k in (2, 3, 4):
            b.append(f'<line x1="{sx:.3f}" y1="{sy:.3f}" x2="{ex:.3f}" y2="{ey:.3f}" stroke="{SOFT}" stroke-width="1.2" stroke-dasharray="5,4" marker-end="url(#{slug}-arrow-soft)"/>')
    for k, (name, sub, focal, mono) in enumerate(stations):
        x0, y0, _ = centers[k]
        b.append(node(x0 - a, y0 - bb, sw, sh, name, sub, 'focal' if focal else 'step', sub_mono=mono))
    b.append(f'<rect x="{cx - A}" y="{cy - B}" width="{hw}" height="{hh}" rx="8" fill="{BRAND}"/>')
    b.append(text(cx, cy - 6, 'คู่มือในโฟลเดอร์ manual/', 16, 600, '#ffffff'))
    b.append(text(cx, cy + 16, 'หน้า · ภาพ · การรับรอง', 13, 400, '#c9d6e3'))
    b.append(text(cx, H - 22, 'เส้นทึบ: ลำดับงานแต่ละรอบ · เส้นประ: สิ่งที่บันทึกกลับเข้าคู่มือ', 13, 400, MUTED))
    return slug, svg(slug, W, H, 'คู่มือตามระบบทันเมื่อโค้ดเปลี่ยน',
                     'เมื่อโค้ดเปลี่ยน manual-kit check หาหน้าที่ไม่ตรงระบบ /manual update แก้เฉพาะหน้าที่กระทบ ถ่ายภาพใหม่ คนอ่านแล้วรับรอง แล้วออกไฟล์ใหม่ ทุกรอบบันทึกกลับเข้าคู่มือในโฟลเดอร์ manual',
                     '\n'.join(b))


for slug, s in (how_it_works(), keep_current()):
    (HERE / f'{slug}.svg').write_text(s, encoding='utf-8')
    print('wrote', slug + '.svg')
