"""Generate local OCR upload fixtures using the OCR Worker's Pillow dependency."""

import argparse
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("output", type=Path)
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)

font_path = Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts/arial.ttf"
font = ImageFont.truetype(str(font_path) if font_path.is_file() else "DejaVuSans.ttf", 40)
image = Image.new("RGB", (1200, 500), "white")
draw = ImageDraw.Draw(image)
for y, text in (
    (80, "MINICOZE UPLOAD ACCEPTANCE"),
    (160, "Knowledge parsing verification 20261125"),
    (240, "Travel reimbursement requires an invoice."),
):
    draw.text((50, y), text, fill="black", font=font)

# A real, uncompressed PNG above 1 MiB exercises the restored upload limit.
image.save(args.output / "acceptance.png", compress_level=0)
image.save(args.output / "acceptance.jpg", quality=95)
# Raster-only PDF: no text layer, so success must pass through PDF OCR fallback.
image.save(args.output / "acceptance-scan.pdf", resolution=150)
for name in ("acceptance.png", "acceptance.jpg", "acceptance-scan.pdf"):
    print(name, (args.output / name).stat().st_size)
