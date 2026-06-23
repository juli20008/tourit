#!/usr/bin/env python3
"""
add_stroke.py — 给抠图后的透明 PNG / 视频帧 加白色描边

独立使用:
    python add_stroke.py input.png [output.png] [--width 12]

作为模块导入:
    from add_stroke import add_white_stroke
    result = add_white_stroke(rgba_image, stroke_width=12)
"""

import argparse
import os
import sys

import numpy as np
from PIL import Image
from scipy.ndimage import binary_dilation


def add_white_stroke(img: Image.Image, stroke_width: int = 12) -> Image.Image:
    """
    给 RGBA 图像在人物四周加一圈纯白描边。

    原理：把 alpha 遮罩膨胀 stroke_width 像素 → 填白 → 贴回原图上方。
    返回新的 RGBA Image，尺寸不变。
    """
    img = img.convert("RGBA")
    r, g, b, a = img.split()

    alpha_np = np.array(a)

    # 用圆形结构元素做膨胀，边缘更圆润
    radius = stroke_width
    y_idx, x_idx = np.ogrid[-radius: radius + 1, -radius: radius + 1]
    struct = x_idx ** 2 + y_idx ** 2 <= radius ** 2

    mask = alpha_np > 30                        # 过滤半透明噪点
    dilated = binary_dilation(mask, structure=struct)
    stroke_mask = dilated & ~mask               # 只要描边区域（原人物外圈）

    # 描边层：白色，仅在 stroke_mask 处不透明
    stroke_layer = np.zeros((*alpha_np.shape, 4), dtype=np.uint8)
    stroke_layer[dilated] = [255, 255, 255, 255]   # 整个膨胀区域填白
    stroke_img = Image.fromarray(stroke_layer, "RGBA")

    # 合成：白边在下，原图在上
    result = Image.alpha_composite(stroke_img, img)
    return result


def process_file(input_path: str, output_path: str, stroke_width: int):
    img = Image.open(input_path).convert("RGBA")
    result = add_white_stroke(img, stroke_width)
    result.save(output_path)
    print(f"Saved: {output_path}")


def main():
    parser = argparse.ArgumentParser(description="给透明 PNG 加白色描边")
    parser.add_argument("input", help="输入 PNG（RGBA）")
    parser.add_argument("output", nargs="?", help="输出路径（默认 input_stroke.png）")
    parser.add_argument("--width", type=int, default=12, help="描边宽度，像素（默认 12）")
    args = parser.parse_args()

    if not os.path.isfile(args.input):
        sys.exit(f"File not found: {args.input}")

    out = args.output
    if not out:
        base, ext = os.path.splitext(args.input)
        out = f"{base}_stroke{ext}"

    process_file(args.input, out, args.width)


if __name__ == "__main__":
    main()
