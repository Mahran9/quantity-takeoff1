#!/usr/bin/env python3
"""
Generates the hand-computable DXF fixtures used by tests/dxf_end_to_end.test.ts.
Pure standard library (no ezdxf).  Outputs are committed; re-run to regenerate:

    python3 tests/fixtures/generate_fixtures.py

Fixtures (expected analytic numbers are asserted in the test and hand-computed there):
  warehouse_mm.dxf               mm warehouse: nested blocks, MINSERT, hatch-with-hole, paper-space title block,
                                 frozen layer, exact duplicates, double-line walls, "%%c" text
  warehouse_arabic_utf8.dxf      metres, Arabic layer names, UTF-8
  warehouse_arabic_cp1256.dxf    same drawing, ANSI_1256 bytes ($DWGCODEPAGE)
  broken_unitless_mm.dxf         no $INSUNITS, slab without thickness, walls without height, big unclassified layer
  broken_wrong_unit.dxf          $INSUNITS=6 (metres) but the drawing is really in mm  -> implausible span
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))


class Dxf:
    def __init__(self, insunits=None, codepage=None, version="AC1032"):
        self.insunits, self.codepage, self.version = insunits, codepage, version
        self.layers = []   # (name, flags, color)
        self.blocks = []   # str chunks
        self.ents = []     # str chunks

    @staticmethod
    def g(code, val):
        return f"{code:>3}\n{val}\n"

    def layer(self, name, flags=0, color=7):
        self.layers.append((name, flags, color))

    def _e(self, typ, layer, paper=False):
        s = self.g(0, typ) + self.g(8, layer)
        if paper:
            s += self.g(67, 1)
        return s

    def line(self, layer, x1, y1, x2, y2, paper=False, into=None):
        s = self._e("LINE", layer, paper) + self.g(10, x1) + self.g(20, y1) + self.g(11, x2) + self.g(21, y2)
        (into if into is not None else self.ents).append(s)

    def lwpoly(self, layer, pts, closed=True, paper=False, into=None):
        s = self._e("LWPOLYLINE", layer, paper) + self.g(90, len(pts)) + self.g(70, 1 if closed else 0)
        for x, y in pts:
            s += self.g(10, x) + self.g(20, y)
        (into if into is not None else self.ents).append(s)

    def rect(self, layer, x, y, w, h, **kw):
        self.lwpoly(layer, [(x, y), (x + w, y), (x + w, y + h), (x, y + h)], **kw)

    def insert(self, layer, name, x, y, rows=1, cols=1, dx=0, dy=0, paper=False, into=None):
        s = self._e("INSERT", layer, paper) + self.g(2, name) + self.g(10, x) + self.g(20, y)
        if rows > 1 or cols > 1:
            s += self.g(70, cols) + self.g(71, rows) + self.g(44, dx) + self.g(45, dy)
        (into if into is not None else self.ents).append(s)

    def text(self, layer, x, y, h, txt, paper=False):
        self.ents.append(self._e("TEXT", layer, paper) + self.g(10, x) + self.g(20, y) + self.g(40, h) + self.g(1, txt))

    def hatch(self, layer, loops):
        """loops: list of point lists (first = outer, others = holes)."""
        s = self._e("HATCH", layer) + self.g(10, 0) + self.g(20, 0) + self.g(30, 0) + self.g(210, 0) + self.g(220, 0) + self.g(230, 1)
        s += self.g(2, "SOLID") + self.g(70, 1) + self.g(71, 0) + self.g(91, len(loops))
        for i, pts in enumerate(loops):
            s += self.g(92, 3 if i == 0 else 2) + self.g(72, 0) + self.g(73, 1) + self.g(93, len(pts))
            for x, y in pts:
                s += self.g(10, x) + self.g(20, y)
            s += self.g(97, 0)
        s += self.g(75, 0) + self.g(76, 1)
        self.ents.append(s)

    def block(self, name, build):
        inner = []
        build(inner)
        self.blocks.append(self.g(0, "BLOCK") + self.g(8, "0") + self.g(2, name) + self.g(70, 0) + self.g(10, 0) + self.g(20, 0)
                           + "".join(inner) + self.g(0, "ENDBLK") + self.g(8, "0"))

    def render(self):
        s = self.g(0, "SECTION") + self.g(2, "HEADER") + self.g(9, "$ACADVER") + self.g(1, self.version)
        if self.codepage:
            s += self.g(9, "$DWGCODEPAGE") + self.g(3, self.codepage)
        if self.insunits is not None:
            s += self.g(9, "$INSUNITS") + self.g(70, self.insunits)
        s += self.g(0, "ENDSEC")
        s += self.g(0, "SECTION") + self.g(2, "TABLES") + self.g(0, "TABLE") + self.g(2, "LAYER") + self.g(70, len(self.layers))
        for name, flags, color in self.layers:
            s += self.g(0, "LAYER") + self.g(2, name) + self.g(70, flags) + self.g(62, color) + self.g(6, "CONTINUOUS")
        s += self.g(0, "ENDTAB") + self.g(0, "ENDSEC")
        s += self.g(0, "SECTION") + self.g(2, "BLOCKS") + "".join(self.blocks) + self.g(0, "ENDSEC")
        s += self.g(0, "SECTION") + self.g(2, "ENTITIES") + "".join(self.ents) + self.g(0, "ENDSEC") + self.g(0, "EOF")
        return s

    def save(self, fname, encoding="utf-8"):
        with open(os.path.join(HERE, fname), "wb") as f:
            f.write(self.render().encode(encoding))


def warehouse_mm():
    d = Dxf(insunits=4)
    for n, fl in [("S-SLAB", 0), ("S-FOOTINGS", 0), ("A-WALL", 0), ("S-BEAMS", 0), ("S-COLUMNS", 0), ("FLOOR-FINISH", 0),
                  ("S-NOTES", 0), ("TITLE", 0), ("S-OLD-SLAB", 1)]:
        d.layer(n, fl)
    # slab 20000 x 10000 mm = 200 m2
    d.rect("S-SLAB", 0, 0, 20000, 10000)
    # frozen layer carrying an identical slab (must NOT be counted)
    d.rect("S-OLD-SLAB", 0, 0, 20000, 10000)
    # 6 footings 1500 x 1500 = 2.25 m2 each
    fx = [1000, 5000, 9000, 13000, 16000, 18000]
    for x in fx:
        d.rect("S-FOOTINGS", x, 1000, 1500, 1500)
    d.rect("S-FOOTINGS", 1000, 1000, 1500, 1500)  # exact duplicate #1 (same order)
    d.lwpoly("S-FOOTINGS", [(1000, 2500), (2500, 2500), (2500, 1000), (1000, 1000)])  # exact duplicate #2 (reversed order)
    # floor finish: hatch 20000x10000 with 2000x2000 hole -> 196 m2
    d.hatch("FLOOR-FINISH", [[(0, 0), (20000, 0), (20000, 10000), (0, 10000)],
                              [(5000, 4000), (7000, 4000), (7000, 6000), (5000, 6000)]])
    # double-line walls: 2 x 20 m + 2 x 10 m = 60 m raw (30 m with divisor 2)
    d.line("A-WALL", 0, 0, 20000, 0)
    d.line("A-WALL", 0, 200, 20000, 200)
    d.line("A-WALL", 0, 0, 0, 10000)
    d.line("A-WALL", 200, 0, 200, 10000)
    d.line("A-WALL", 20000, 0, 0, 0)  # exact duplicate (reversed direction)
    # beams: 3 x 6 m = 18 m
    for y in (3000, 5000, 7000):
        d.line("S-BEAMS", 1000, y, 7000, y)
    # blocks: C1 column; COLGROUP nests 2 x C1; SC1 steel column
    d.block("C1", lambda b: d.rect("0", -200, -200, 400, 400, into=b))
    d.block("SC1", lambda b: d.rect("0", -150, -150, 300, 300, into=b))

    def colgroup(b):
        d.insert("0", "C1", 0, 0, into=b)
        d.insert("0", "C1", 3000, 0, into=b)
    d.block("COLGROUP", colgroup)
    for x in (1000, 5000, 9000, 13000):
        d.insert("S-COLUMNS", "C1", x, 12000)
    d.insert("S-COLUMNS", "C1", 1000, 12000)          # exact duplicate INSERT
    d.insert("S-COLUMNS", "COLGROUP", 0, 15000)       # nests 2 x C1
    d.insert("S-COLUMNS", "SC1", 0, 20000, rows=3, cols=2, dx=4000, dy=4000)  # MINSERT 3 x 2 = 6
    # annotation: slab thickness note + diameter code
    d.text("S-NOTES", 0, -2000, 200, "ROOF SLAB THK = 200 MM")
    d.text("S-NOTES", 0, -3000, 200, "COL %%c400 REINF %%c16@200")
    # paper space title block (huge) + paper-space insert -> must be skipped
    d.rect("S-SLAB", 0, 0, 420000, 297000, paper=True)
    d.rect("TITLE", 0, 0, 400000, 280000, paper=True)
    d.insert("S-COLUMNS", "C1", 5000, 5000, paper=True)
    d.save("warehouse_mm.dxf")


def arabic(codepage, fname, encoding):
    d = Dxf(insunits=6, codepage=codepage, version="AC1018" if codepage else "AC1032")
    slab, walls = "بلاطة_سقف", "جدران"
    d.layer(slab); d.layer(walls)
    d.rect(slab, 0, 0, 10, 5)             # 50 m2
    d.line(walls, 0, 0, 12, 0)            # 12 m
    d.line(walls, 0, 6, 8, 6)             # 8 m
    d.text("0", 0, -1, 0.2, "%%c16 @ 200")
    d.save(fname, encoding)


def broken_unitless():
    d = Dxf(insunits=None)
    for n in ("S-SLAB", "A-WALL", "MISC-STUFF"):
        d.layer(n)
    d.rect("S-SLAB", 0, 0, 30000, 15000)          # 450 m2, no thickness anywhere
    d.line("A-WALL", 0, 0, 30000, 0)              # 30 m, no wall height
    d.rect("MISC-STUFF", 2000, 2000, 25000, 12000)  # 300 m2 unclassified (40% of total area)
    d.save("broken_unitless_mm.dxf")


def broken_wrong_unit():
    d = Dxf(insunits=6)  # claims metres but coordinates are millimetres
    d.layer("S-SLAB")
    d.rect("S-SLAB", 0, 0, 30000, 15000)
    d.save("broken_wrong_unit.dxf")


if __name__ == "__main__":
    warehouse_mm()
    arabic(None, "warehouse_arabic_utf8.dxf", "utf-8")
    arabic("ANSI_1256", "warehouse_arabic_cp1256.dxf", "cp1256")
    broken_unitless()
    broken_wrong_unit()
    print("fixtures written to", HERE)
