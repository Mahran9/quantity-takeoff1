from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
W,H=841*mm,594*mm
import os
c=canvas.Canvas(os.path.join(os.path.dirname(os.path.abspath(__file__)),"villa.pdf"),pagesize=(W,H))
M=lambda v: v*10*mm   # 1:100 -> 1 m = 10 mm
ox,oy=150*mm,150*mm
c.setLineWidth(1); c.rect(10*mm,10*mm,W-20*mm,H-20*mm)
big=[(0,0),(4,0),(8,0),(12,0),(0,10),(4,10),(8,10),(12,10)]; small=[(0,5),(4,5),(8,5),(12,5)]
c.setStrokeColorRGB(1,.5,0); c.setLineWidth(.4)
for x,y in big: c.rect(ox+M(x-.75),oy+M(y-.75),M(1.5),M(1.5))
for x,y in small: c.rect(ox+M(x-.6),oy+M(y-.6),M(1.2),M(1.2))
c.setStrokeColorRGB(0,0,0); c.setFillColorRGB(0,0,0); c.setLineWidth(.2)
for x,y in big+small: c.rect(ox+M(x-.125),oy+M(y-.25),M(.25),M(.5),stroke=1,fill=1)
c.setLineWidth(1.6)
for (a,b) in [((0,0),(12,0)),((12,0),(12,10)),((12,10),(0,10)),((0,10),(0,0)),((0,5),(12,5)),((6,5),(6,10)),((6,0),(6,5))]:
    c.line(ox+M(a[0]),oy+M(a[1]),ox+M(b[0]),oy+M(b[1]))
c.setStrokeColorRGB(0,0,1); c.setLineWidth(.7)
for y in (2,7.5,8.5): c.line(ox+M(0),oy+M(y),ox+M(12),oy+M(y))
for x in (2,10): c.line(ox+M(x),oy+M(0),ox+M(x),oy+M(10))
c.setStrokeColorRGB(.5,.5,.5); c.setLineWidth(.3); c.rect(ox+M(-.2),oy+M(-.2),M(12.4),M(10.4))
c.setFillColorRGB(0,0,0); c.setFont("Helvetica",10)
c.drawString(30*mm,H-30*mm,"VILLA GROUND PLAN  SCALE 1:100")
for t,x,y in [("12000",ox+M(5.5),oy-M(1.5)),("4000",ox+M(1.8),oy-M(1)),("4000",ox+M(5.8),oy-M(1)),("4000",ox+M(9.8),oy-M(1)),("10000",ox-M(1.5),oy+M(4.5)),("5000",ox-M(1),oy+M(2)),("5000",ox-M(1),oy+M(7))]:
    c.drawString(x,y,t)
c.save()
