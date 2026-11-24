"""Generates benchmark DXF drawings whose true quantities are known by construction.
Run: python3 tests/benchmark/gen.py  (writes *.dxf + expected.json next to this file)."""
import json, os
OUT = os.path.dirname(os.path.abspath(__file__))

class Dxf:
    def __init__(self, insunits=6, layers=()):
        self.ents, self.blocks, self.insunits, self.layers = [], [], insunits, list(layers)
    def line(self, layer, a, b): self.ents.append(("LINE", layer, [a, b]))
    def poly(self, layer, pts, closed=True): self.ents.append(("POLY", layer, (pts, closed)))
    def rect(self, layer, x, y, w, h): self.poly(layer, [(x, y), (x + w, y), (x + w, y + h), (x, y + h)])
    def insert(self, layer, name, x, y): self.ents.append(("INSERT", layer, (name, x, y)))
    def text(self, layer, x, y, s, h=0.25): self.ents.append(("TEXT", layer, (x, y, s, h)))
    def block(self, name, geom): self.blocks.append((name, geom))
    def dump(self, path, enc="utf-8"):
        o = []
        w = lambda c, v: o.extend([str(c), str(v)])
        w(0, "SECTION"); w(2, "HEADER"); w(9, "$INSUNITS"); w(70, self.insunits); w(0, "ENDSEC")
        w(0, "SECTION"); w(2, "TABLES"); w(0, "TABLE"); w(2, "LAYER")
        for n in sorted({l for _, l, _ in self.ents} | set(self.layers)):
            w(0, "LAYER"); w(2, n); w(70, 0); w(62, 7); w(6, "CONTINUOUS")
        w(0, "ENDTAB"); w(0, "ENDSEC")
        w(0, "SECTION"); w(2, "BLOCKS")
        for name, geom in self.blocks:
            w(0, "BLOCK"); w(8, "0"); w(2, name); w(70, 0); w(10, 0); w(20, 0); w(30, 0)
            for (x1, y1, x2, y2) in geom: w(0, "LINE"); w(8, "0"); w(10, x1); w(20, y1); w(30, 0); w(11, x2); w(21, y2); w(31, 0)
            w(0, "ENDBLK"); w(8, "0")
        w(0, "ENDSEC")
        w(0, "SECTION"); w(2, "ENTITIES")
        for kind, layer, d in self.ents:
            if kind == "LINE":
                (x1, y1), (x2, y2) = d
                w(0, "LINE"); w(8, layer); w(10, x1); w(20, y1); w(30, 0); w(11, x2); w(21, y2); w(31, 0)
            elif kind == "POLY":
                pts, closed = d
                w(0, "LWPOLYLINE"); w(8, layer); w(90, len(pts)); w(70, 1 if closed else 0)
                for x, y in pts: w(10, x); w(20, y)
            elif kind == "INSERT":
                n, x, y = d
                w(0, "INSERT"); w(8, layer); w(2, n); w(10, x); w(20, y); w(30, 0)
            elif kind == "TEXT":
                x, y, s, h = d
                w(0, "TEXT"); w(8, layer); w(10, x); w(20, y); w(30, 0); w(40, h); w(1, s)
        w(0, "ENDSEC"); w(0, "EOF")
        with open(path, "w", encoding=enc, newline="\n") as f: f.write("\n".join(o) + "\n")

WALLS = [((0, 0), (12, 0)), ((12, 0), (12, 10)), ((12, 10), (0, 10)), ((0, 10), (0, 0)),   # exterior 44 m
         ((0, 5), (12, 5)), ((6, 5), (6, 10)), ((6, 0), (6, 5))]                               # interior 22 m
TRUE = dict(footings=12, footing_area=23.76, columns=12, wall_len=66.0, slab_area=128.96, beam_len=56.0, doors=6, windows=8)

def villa(names, scale=1.0, insunits=6, double_walls=False, closed_walls=False, dup=False):
    """12 x 10 m villa with the quantities in TRUE (by construction)."""
    d = Dxf(insunits)
    S = lambda v: v * scale
    P = lambda x, y: (S(x), S(y))
    big = [(0, 0), (4, 0), (8, 0), (12, 0), (0, 10), (4, 10), (8, 10), (12, 10)]
    small = [(0, 5), (4, 5), (8, 5), (12, 5)]
    for x, y in big: d.rect(names["foot"], S(x - .75), S(y - .75), S(1.5), S(1.5))
    for x, y in small: d.rect(names["foot"], S(x - .6), S(y - .6), S(1.2), S(1.2))
    for x, y in big + small: d.rect(names["col"], S(x - .125), S(y - .25), S(.25), S(.5))
    w = names["wall"]
    if closed_walls:
        d.poly(w, [P(0, 0), P(12, 0), P(12, 10), P(0, 10)])
        for a, b in WALLS[4:]: d.line(w, P(*a), P(*b))
    else:
        for a, b in WALLS: d.line(w, P(*a), P(*b))
    if double_walls:   # drawn as two parallel lines 0.2 m apart, centre-line value is still TRUE
        d.ents = [e for e in d.ents if e[1] != w]
        for (x1, y1), (x2, y2) in WALLS:
            dx, dy = (0, .1) if y1 == y2 else (.1, 0)
            d.line(w, P(x1 - dx, y1 - dy), P(x2 - dx, y2 - dy)); d.line(w, P(x1 + dx, y1 + dy), P(x2 + dx, y2 + dy))
    if dup:            # a copy pasted on top of itself (very common)
        d.ents += [e for e in d.ents if e[1] == w]
    d.rect(names["slab"], S(-.2), S(-.2), S(12.4), S(10.4))
    for y in (2.5, 5, 7.5): d.line(names["beam"], P(0, y), P(12, y))
    for x in (2, 10): d.line(names["beam"], P(x, 0), P(x, 10))
    d.block("D1", [(0, 0, S(.9), 0)]); d.block("W1", [(0, 0, S(1.2), 0)])
    for i in range(6): d.insert(names["door"], "D1", S(1 + i * 1.7), S(5))
    for i in range(8): d.insert(names["win"], "W1", S(1 + i * 1.3), S(10))
    return d

CLEAN = dict(foot="S-FOOTING", col="S-COLUMN", wall="A-WALL", slab="S-SLAB", beam="S-BEAM", door="A-DOOR", win="A-WINDOW")
MESSY = dict(foot="Layer1", col="COL", wall="WALLS", slab="FLOOR_SLAB", beam="BEAMS", door="DOORS", win="WINDOWS")
ARABIC = dict(foot="قواعد", col="اعمدة", wall="جدران", slab="بلاطة", beam="كمرات", door="ابواب", win="شبابيك")
GENERIC = dict(foot="0", col="0", wall="0", slab="0", beam="0", door="0", win="0")

CASES = {
    "clean_m": dict(names=CLEAN),
    "clean_mm": dict(names=CLEAN, scale=1000, insunits=4),
    "clean_closed_walls": dict(names=CLEAN, closed_walls=True),
    "clean_dup": dict(names=CLEAN, dup=True),
    "clean_double_walls": dict(names=CLEAN, double_walls=True),
    "messy_names": dict(names=MESSY),
    "arabic_names": dict(names=ARABIC),
}

if __name__ == "__main__":
    for k, kw in CASES.items(): villa(**kw).dump(os.path.join(OUT, k + ".dxf"))
    json.dump(TRUE, open(os.path.join(OUT, "truth.json"), "w"), indent=1)
    print("wrote", len(CASES), "cases")
