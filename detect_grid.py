from PIL import Image
import numpy as np

img = Image.open("Gemini_Generated_Image_.png").convert("RGB")
arr = np.array(img)
h, w = arr.shape[:2]

print(f"Image size: {w}x{h}")

# Find horizontal lines by looking for rows that are nearly uniform (grid lines)
# Gray background rows will have low standard deviation across the row
row_stds = arr.std(axis=(1, 2))  # std per row across all channels and pixels

# Find rows with low variance — these are likely grid separator lines
threshold = row_stds.mean() * 0.3
candidate_rows = np.where(row_stds < threshold)[0]
print(f"Low-variance rows (potential grid lines): {candidate_rows[:30]}")

# Group consecutive rows into bands
if len(candidate_rows) > 0:
    groups = []
    start = candidate_rows[0]
    prev = candidate_rows[0]
    for r in candidate_rows[1:]:
        if r - prev > 5:
            groups.append((start, prev))
            start = r
        prev = r
    groups.append((start, prev))
    print(f"Grid line bands: {groups}")
