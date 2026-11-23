"""Generates PDF drawing fixtures with KNOWN quantities (tests compare against these numbers).
Run: python3 tests/fixtures/pdf/make_pdf_fixtures.py <outdir>
Paper units are mm; scale 1:100 unless stated, so 1 mm on paper = 0.1 m real."""
import sys, os, math
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from reportlab.lib.pagesizes import A3, landscape

out = sys.argv[1]; os.makedirs(out, exist_ok=True)
W, H = landscape(A3)

def frame(c):
    c.setLineWidth(1.0); c.rect(10*mm, 10*mm, W-20*mm, H-20*mm)

def plan(c, ox=40*mm, oy=60*mm, scale_text="SCALE 1:100", dim_labels=True, double=False):
    # building 20 m x 12 m  -> 200 x 120 mm on paper
    c.setStrokeColorRGB(0, 0, 0); c.setLineWidth(1.5)
    c.rect(ox, oy, 200*mm, 120*mm)
    if double: c.rect(ox, oy, 200*mm, 120*mm)            # exact duplicate overlay
    # interior wall 8 m long (80 mm) horizontal, one 5 m vertical (50 mm): colour red
    c.setStrokeColorRGB(1, 0, 0); c.setLineWidth(0.8)
    c.line(ox+30*mm, oy+60*mm, ox+110*mm, oy+60*mm)
    c.line(ox+150*mm, oy+10*mm, ox+150*mm, oy+60*mm)
    # 6 columns 0.5x0.5 m (5x5 mm) filled blue
    c.setFillColorRGB(0, 0, 1); c.setStrokeColorRGB(0, 0, 1); c.setLineWidth(0.3)
    for i in range(3):
        for j in range(2):
            c.rect(ox+20*mm+i*80*mm, oy+20*mm+j*70*mm, 5*mm, 5*mm, stroke=1, fill=1)
    # circular tank diameter 4 m (r = 20 mm) circumference 4*pi = 12.566 m
    c.setStrokeColorRGB(0, 0.5, 0); c.setFillColorRGB(1, 1, 1); c.setLineWidth(0.5)
    c.circle(ox+170*mm, oy+90*mm, 10*mm, stroke=1, fill=0)  # r=10mm -> 1 m radius -> circumference 6.283 m
    # text
    c.setFillColorRGB(0, 0, 0); c.setFont("Helvetica", 10)
    c.drawString(20*mm, H-20*mm, scale_text)
    if dim_labels:
        c.drawString(ox+90*mm, oy-8*mm, "20.00")
        c.drawString(ox-18*mm, oy+55*mm, "12.00")
        c.drawString(ox+60*mm, oy+63*mm, "8.00")
        c.drawString(ox+152*mm, oy+30*mm, "5.00")
        c.drawString(ox+22*mm, oy+27*mm, "0.50")

# 1) basic plan
c = canvas.Canvas(f"{out}/plan_basic.pdf", pagesize=(W, H)); frame(c); plan(c); c.save()
# 2) with duplicate-drawn outline
c = canvas.Canvas(f"{out}/plan_duplicates.pdf", pagesize=(W, H)); frame(c); plan(c, double=True); c.save()
# 3) transformed CTM: whole plan drawn in a scaled+translated+saved state (cm units: 1 unit = 1 cm user space)
c = canvas.Canvas(f"{out}/plan_ctm.pdf", pagesize=(W, H)); frame(c)
c.saveState(); c.translate(5*mm, 5*mm); c.scale(0.5, 0.5); c.translate(0, 0)
# draw at 2x then scaled by 0.5 -> same result as basic offset by 5mm
c.saveState(); c.scale(2, 2); plan(c); c.restoreState(); c.restoreState(); c.save()
# 4) text says 1:50 but drawing is 1:100 (mismatch)
c = canvas.Canvas(f"{out}/plan_scale_mismatch.pdf", pagesize=(W, H)); frame(c); plan(c, scale_text="SCALE 1:50"); c.save()
# 5) no scale text, dimensions only
c = canvas.Canvas(f"{out}/plan_no_scale_text.pdf", pagesize=(W, H)); frame(c); plan(c, scale_text="PLAN"); c.save()
# 6) rotated page (90)
c = canvas.Canvas(f"{out}/plan_rotated.pdf", pagesize=(W, H)); frame(c); plan(c); c.setPageRotation(90); c.save()
# 7) empty / raster-like page
c = canvas.Canvas(f"{out}/page_empty.pdf", pagesize=(W, H)); c.drawString(50, 50, "no vector here"); c.save()

# 8) Form XObject drawn twice (typical-floor repeat) with its own matrix; each instance holds a 10 m line + one 1x1 m rect
c = canvas.Canvas(f"{out}/plan_forms.pdf", pagesize=(W, H)); frame(c)
c.beginForm("typ")
c.setStrokeColorRGB(0, 0, 0); c.setLineWidth(0.7)
c.line(0, 0, 100*mm, 0); c.rect(10*mm, 10*mm, 10*mm, 10*mm)
c.endForm()
c.saveState(); c.translate(40*mm, 100*mm); c.doForm("typ"); c.restoreState()
c.saveState(); c.translate(40*mm, 200*mm); c.rotate(90); c.doForm("typ"); c.restoreState()
c.save()
