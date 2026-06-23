from PIL import Image
from rembg import remove, new_session
import os

src = "Gemini_Generated_Image_.png"
out_dir = "grid_cutouts"
os.makedirs(out_dir, exist_ok=True)

# birefnet-general: best hair/fine-edge preservation
print("Loading birefnet-general model (downloads ~200MB first run)...")
session = new_session("birefnet-general")
print("Model ready.")

img = Image.open(src)

row_cuts = [2, 352, 704, 1056, 1404]
col_cuts = [0, 256, 512, 768]

n = 1
for r in range(len(row_cuts) - 1):
    for c in range(len(col_cuts) - 1):
        box = (col_cuts[c], row_cuts[r], col_cuts[c+1], row_cuts[r+1])
        cell = img.crop(box)
        print(f"Processing cell {n}/12 (row {r+1}, col {c+1})...")
        result = remove(cell, session=session)
        out_path = os.path.join(out_dir, f"cell_{n:02d}.png")
        result.save(out_path)
        print(f"  Saved {out_path}")
        n += 1

print("Done. 12 cells saved to grid_cutouts/")
