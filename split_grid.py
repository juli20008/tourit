from PIL import Image
from rembg import remove
import os

src = "Gemini_Generated_Image_.png"
out_dir = "grid_cutouts"
os.makedirs(out_dir, exist_ok=True)

img = Image.open(src)
w, h = img.size

# Detected grid lines (5-pixel bands of uniform gray background)
row_cuts = [2, 352, 704, 1056, 1404]   # 4 rows
col_cuts = [0, 256, 512, 768]           # 3 cols

n = 1
for r in range(len(row_cuts) - 1):
    for c in range(len(col_cuts) - 1):
        box = (col_cuts[c], row_cuts[r], col_cuts[c+1], row_cuts[r+1])
        cell = img.crop(box)
        print(f"Processing cell {n}/12 (row {r+1}, col {c+1})...")
        result = remove(cell)
        out_path = os.path.join(out_dir, f"cell_{n:02d}.png")
        result.save(out_path)
        print(f"  Saved {out_path}")
        n += 1

print("Done. 12 cells saved to grid_cutouts/")
