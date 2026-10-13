"""Download Google Fonts text subsets for the static pages; preserve upstream OFL licenses."""
from pathlib import Path
from html.parser import HTMLParser
import re, urllib.request, urllib.parse, json
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets/fonts'
OUT.mkdir(parents=True, exist_ok=True)
class Text(HTMLParser):
    def __init__(self): super().__init__(); self.parts=[]; self.skip=0
    def handle_starttag(self,tag,attrs):
        if tag in ('script','style'): self.skip+=1
    def handle_endtag(self,tag):
        if tag in ('script','style'): self.skip=max(0,self.skip-1)
    def handle_data(self,text):
        if not self.skip: self.parts.append(text)
texts=[]
for path in [ROOT/'index.html', *sorted((ROOT/'examples').glob('*.html'))]:
    doc=Text(); doc.feed(path.read_text(encoding='utf-8')); texts.extend(doc.parts)
# Script-generated interface labels, transcripts and scoring notes need coverage too.
for path in [ROOT/'index.html', *sorted((ROOT/'examples').glob('*.html'))]:
    texts.append(''.join(re.findall(r'[\u3400-\u9fff]',path.read_text(encoding='utf-8'))))
chars=''.join(sorted(set(''.join(texts)+''.join(chr(i) for i in range(32,127))+'→↗↑×—·≥✓✗℃')))
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
def fetch(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent':UA}),timeout=60).read()
specs=[('Noto Sans SC','Noto+Sans+SC:wght@100..900','notosanssc',True),('Noto Serif SC','Noto+Serif+SC:wght@400..900','notoserifsc',True),('Instrument Serif','Instrument+Serif:ital@0;1','instrumentserif',False),('JetBrains Mono','JetBrains+Mono:wght@400..500','jetbrainsmono',False),('Fraunces','Fraunces:ital,opsz,wght,SOFT@0,9..144,300..700,0..100;1,9..144,300..700,0..100','fraunces',False),('IBM Plex Mono','IBM+Plex+Mono:wght@400;500','ibmplexmono',False),('Archivo','Archivo:wdth,wght@62..125,200..800','archivo',False),('Bricolage Grotesque','Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,300..800','bricolagegrotesque',False)]
css=[];manifest=[]
for family,spec,folder,cjk in specs:
    text=chars if cjk else ''.join(c for c in chars if ord(c)<128 or c in '→↗↑×—·≥✓✗')
    url='https://fonts.googleapis.com/css2?family='+spec+'&display=swap&text='+urllib.parse.quote(text)
    source=fetch(url).decode()
    for i,block in enumerate(re.findall(r'@font-face\s*\{[^}]+\}',source)):
        remote=re.search(r'url\(([^)]+)\)',block).group(1)
        ext='.woff2' if "format('woff2')" in block else '.ttf'
        name=f'{folder}-{i}{ext}'
        data=fetch(remote);(OUT/name).write_bytes(data)
        css.append(block.replace(remote,'fonts/'+name))
        manifest.append({'family':family,'file':name,'bytes':len(data),'source':remote,'characters':len(text)})
    (OUT/(folder+'-OFL.txt')).write_bytes(fetch('https://raw.githubusercontent.com/google/fonts/main/ofl/'+folder+'/OFL.txt'))
    print(family, sum(x['bytes'] for x in manifest if x['family']==family),flush=True)
(ROOT/'assets/fonts.css').write_text('\n'.join(css)+'\n',encoding='utf-8')
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
