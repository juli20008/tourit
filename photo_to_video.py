#!/usr/bin/env python3
"""
photo_to_video.py — Photos → 4:3 portrait video (1080×1440)
                    with Ken Burns zoom + pan per photo.

Usage:
    python photo_to_video.py <folder>
    python photo_to_video.py <folder> output.mp4
"""

import glob
import json
import os
import shutil
import subprocess
import sys
import tempfile


def _find_ffmpeg():
    """Return (ffmpeg_exe, ffprobe_exe), searching PATH then Windows install dirs."""
    if shutil.which('ffmpeg'):
        return 'ffmpeg', 'ffprobe'

    candidates = [
        os.path.expandvars(r'%LOCALAPPDATA%\Microsoft\WinGet\Packages'),
        r'C:\ProgramData\chocolatey\bin',
        os.path.expandvars(r'%USERPROFILE%\scoop\shims'),
        r'C:\ffmpeg\bin',
        r'C:\Program Files\ffmpeg\bin',
    ]
    winget_base = os.path.expandvars(r'%LOCALAPPDATA%\Microsoft\WinGet\Packages')
    for pkg in glob.glob(os.path.join(winget_base, 'Gyan.FFmpeg*', '**', 'bin'), recursive=True):
        candidates.insert(0, pkg)

    for d in candidates:
        ff = os.path.join(d, 'ffmpeg.exe')
        fp = os.path.join(d, 'ffprobe.exe')
        if os.path.isfile(ff):
            return ff, fp

    sys.exit(
        'ffmpeg not found. Install it with:\n'
        '  winget install Gyan.FFmpeg\n'
        'Then restart your terminal.'
    )


FFMPEG, FFPROBE = _find_ffmpeg()

# ── Config ─────────────────────────────────────────────────────────────────────
OUTPUT_W   = 1080
OUTPUT_H   = 1440
DURATION   = 3.5
FPS        = 30
CRF        = 20
PRESET     = 'fast'
ZOOM_START = 1.0
ZOOM_END   = 1.30
IMG_EXTS   = {'.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif', '.bmp'}


def run(*cmd):
    subprocess.run(list(cmd), check=True)


def probe_dimensions(path):
    """Return (width, height) via ffprobe."""
    r = subprocess.run(
        [FFPROBE, '-v', 'quiet', '-print_format', 'json', '-show_streams', path],
        capture_output=True, text=True, check=True,
    )
    for stream in json.loads(r.stdout).get('streams', []):
        if 'width' in stream and 'height' in stream:
            return stream['width'], stream['height']
    raise ValueError(f'Cannot read dimensions: {path}')


def make_clip(img_path, out_path, src_w, src_h, reverse=False):
    """
    Any photo → portrait clip with Ken Burns zoom + pan.

    Landscape / near-landscape (scaled-to-height gives width >= OUTPUT_W):
      scale to height (grows with z), crop pans horizontally.

    Portrait (scaled-to-height would be narrower than OUTPUT_W):
      scale to width (grows with z), crop pans vertically.

    z(t) ramps from ZOOM_START to ZOOM_END via cosine ease-in-out.
    reverse=True inverts the curve: zoom-out + opposite pan direction.
    """
    ease = f"(1-cos(PI*t/{DURATION}))/2"
    if reverse:
        ease = f"(1-({ease}))"

    z = f"({ZOOM_START}+({ZOOM_END}-{ZOOM_START})*({ease}))"

    # Decide pan axis based on source aspect ratio vs output ratio
    # scaled-to-height width at zoom=1: src_w * OUTPUT_H / src_h
    scaled_w_at_1 = src_w * OUTPUT_H / src_h

    if scaled_w_at_1 >= OUTPUT_W:
        # Pin height, pan left↔right
        sw = f"trunc(iw*{OUTPUT_H}/ih*({z})/2)*2"
        sh = f"trunc({OUTPUT_H}*({z})/2)*2"
        px = f"(in_w-{OUTPUT_W})*({ease})"
        py = f"(in_h-{OUTPUT_H})/2"
    else:
        # Pin width, pan top↔bottom
        sw = f"trunc({OUTPUT_W}*({z})/2)*2"
        sh = f"trunc(ih*{OUTPUT_W}/iw*({z})/2)*2"
        px = f"(in_w-{OUTPUT_W})/2"
        py = f"(in_h-{OUTPUT_H})*({ease})"

    scale = f"scale='{sw}':'{sh}':eval=frame:flags=lanczos"
    crop  = f"crop={OUTPUT_W}:{OUTPUT_H}:'{px}':'{py}'"

    run(
        FFMPEG, '-y',
        '-loop', '1', '-t', str(DURATION),
        '-i', img_path,
        '-vf', f'{scale},{crop}',
        '-r', str(FPS),
        '-c:v', 'libx264', '-crf', str(CRF), '-preset', PRESET,
        '-pix_fmt', 'yuv420p',
        out_path,
    )


def main():
    if len(sys.argv) < 2:
        sys.exit(f'Usage: python {sys.argv[0]} <folder> [output.mp4]')

    folder = sys.argv[1]
    output = sys.argv[2] if len(sys.argv) > 2 else os.path.join(folder, 'output.mp4')

    if not os.path.isdir(folder):
        sys.exit(f'Folder not found: {folder}')

    # Collect all images in sorted order (01 < 03 < 05 … naturally)
    candidates = sorted(
        f for f in os.listdir(folder)
        if os.path.splitext(f)[1].lower() in IMG_EXTS
    )
    images = []   # list of (path, w, h)
    for fname in candidates:
        path = os.path.join(folder, fname)
        try:
            w, h = probe_dimensions(path)
            images.append((path, w, h))
        except Exception as e:
            print(f'  skip (probe failed): {fname} — {e}')

    if not images:
        sys.exit('No images found.')

    print(f'Found {len(images)} image(s).')
    print(f'Output: {output}\n')

    tmpdir = tempfile.mkdtemp(prefix='photo2vid_')
    try:
        clips = []
        for i, (img, w, h) in enumerate(images):
            clip = os.path.join(tmpdir, f'clip_{i:04d}.mp4')
            orient = 'landscape' if w > h else 'portrait'
            print(f'[{i+1}/{len(images)}] {os.path.basename(img)}  ({w}x{h} {orient})')
            make_clip(img, clip, w, h, reverse=(i % 2 == 1))
            clips.append(clip)

        list_file = os.path.join(tmpdir, 'clips.txt')
        with open(list_file, 'w', encoding='utf-8') as f:
            for clip in clips:
                f.write(f"file '{clip}'\n")

        print('\nConcatenating clips...')
        run(
            FFMPEG, '-y',
            '-f', 'concat', '-safe', '0',
            '-i', list_file,
            '-c', 'copy',
            output,
        )
        print(f'\nDone: {output}')

    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


if __name__ == '__main__':
    main()
