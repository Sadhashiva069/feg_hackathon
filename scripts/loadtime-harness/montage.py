import sys, os, glob
from PIL import Image, ImageDraw
for label in sys.argv[1:]:
    d = os.path.join(os.path.dirname(__file__), '..', 'runs', label); shots = sorted(glob.glob(os.path.join(d, 'shots', '*.jpg')))
    if not shots: print('no shots', label); continue
    im0 = Image.open(shots[0]); tw = 200; th = int(im0.height * tw / im0.width); cols = 10; rows = (len(shots) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * tw, rows * (th + 14)), 'black'); dr = ImageDraw.Draw(sheet)
    for i, s in enumerate(shots):
        t = int(os.path.basename(s)[:5]) / 10; x, y = (i % cols) * tw, (i // cols) * (th + 14)
        sheet.paste(Image.open(s).resize((tw, th)), (x, y + 14)); dr.text((x + 2, y + 1), f"{t:.1f}s", fill='yellow')
    sheet.save(os.path.join(d, 'montage.jpg'), quality=70); print('montage', label, len(shots), 'shots')
