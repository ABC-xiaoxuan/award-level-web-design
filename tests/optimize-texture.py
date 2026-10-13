"""Compress the baked paper texture to a small palette. Requires Pillow."""
from pathlib import Path
from PIL import Image
path=Path(__file__).resolve().parent.parent/'assets/paper-grain.png'
with Image.open(path) as image:
    image.quantize(colors=32).save(path,optimize=True)
print(f'Paper texture: {path.stat().st_size} bytes')
