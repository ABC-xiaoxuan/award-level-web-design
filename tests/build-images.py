"""Generate responsive WebP previews. Requires Pillow: python -m pip install pillow."""
from pathlib import Path
from PIL import Image
import json

root=Path(__file__).resolve().parent.parent
shots=root/'examples/screenshots'
manifest=[]
for path in sorted(shots.glob('*.png')):
    with Image.open(path) as original:
        original=original.convert('RGB')
        for width in [480,960,original.width] if original.width>960 else [original.width]:
            image=original.resize((width,round(original.height*width/original.width)),Image.Resampling.LANCZOS) if width!=original.width else original
            name=path.stem+(f'-{width}' if width!=original.width else '')+'.webp'
            image.save(shots/name,quality=80,method=6)
            manifest.append({'file':name,'width':width,'height':image.height,'bytes':(shots/name).stat().st_size})
hero_files=['01-qimu-desktop-hero.webp','05-jian-desktop-hero.webp','08-echo-desktop-hero.webp']
hero_bytes=sum((shots/name).stat().st_size for name in hero_files)
assert hero_bytes<300000, f'Gallery exceeds 300KB: {hero_bytes}'
(shots/'manifest.json').write_text(json.dumps({'largestGalleryBytes':hero_bytes,'images':manifest},indent=2)+'\n',encoding='utf-8')
print(f'Gallery at largest size: {hero_bytes} bytes (budget: 300000)')
