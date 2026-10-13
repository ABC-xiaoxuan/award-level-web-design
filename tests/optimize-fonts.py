"""Build page-specific WOFF2 subsets from the licensed fonts already in assets/fonts.
Run after changing copy: python -m pip install fonttools brotli; python tests/optimize-fonts.py
No network access required. Original font files and OFL licenses are retained.
"""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools import subset
import json, re
from html import unescape

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / 'assets/fonts'
OUT = FONTS / 'pages'
OUT.mkdir(exist_ok=True)
SPECS = {
    'index': [('notosanssc-0', 'Noto Sans SC', 'normal', '300 900', {'wght': (300, 900)}), ('instrumentserif-0', 'Instrument Serif', 'italic', '400', {}), ('instrumentserif-1', 'Instrument Serif', 'normal', '400', {}), ('jetbrainsmono-0', 'JetBrains Mono', 'normal', '400 500', {})],
    'qimu-coffee': [('notosanssc-0', 'Noto Sans SC', 'normal', '400 500', {'wght': (400, 500)}), ('notoserifsc-0', 'Noto Serif SC', 'normal', '400 900', {}), ('fraunces-0', 'Fraunces', 'italic', '300 700', {'opsz': 144, 'SOFT': 60}), ('fraunces-1', 'Fraunces', 'normal', '300 700', {'opsz': 144, 'SOFT': 60}), ('ibmplexmono-0', 'IBM Plex Mono', 'normal', '400', {}), ('ibmplexmono-1', 'IBM Plex Mono', 'normal', '500', {})],
    'jian-studio': [('notosanssc-0', 'Noto Sans SC', 'normal', '100 500', {'wght': (100, 500)}), ('archivo-0', 'Archivo', 'normal', '300 700', {'wght': (300, 700)}), ('jetbrainsmono-0', 'JetBrains Mono', 'normal', '400 500', {})],
    'echo-app': [('notosanssc-0', 'Noto Sans SC', 'normal', '300 900', {'wght': (300, 900)}), ('bricolagegrotesque-0', 'Bricolage Grotesque', 'normal', '300 700', {'opsz': 14, 'wdth': 100, 'wght': (300, 700)}), ('jetbrainsmono-0', 'JetBrains Mono', 'normal', '400 500', {})],
}
manifest = []
for page, specs in SPECS.items():
    path = ROOT / ('index.html' if page == 'index' else f'examples/{page}.html')
    text = path.read_text(encoding='utf-8') + (ROOT/'assets/motion.js').read_text(encoding='utf-8') + (ROOT/'assets/navigation.js').read_text(encoding='utf-8')
    text = re.sub(r'<template\b.*?</template>', '', text, flags=re.S)
    # Keep interface strings (including JS), punctuation and all ASCII input glyphs.
    chars = {ord(c) for c in text} | set(range(32, 127))
    css = []
    for stem, family, style, weight, axes in specs:
        font = TTFont(FONTS / (stem+'.woff2'))
        present = set(font.getBestCmap())
        wanted = present & chars if family.startswith('Noto') else present
        if page == 'qimu-coffee' and family == 'Noto Serif SC':
            # Serif Chinese appears only in headings, the lead, origin labels and the quotation.
            fragments = re.findall(r'<(h2|h3|blockquote)\b[^>]*>(.*?)</\1>', text, re.S)
            extra = re.findall(r'<(?:p class="lead"|div class="name"|a class="logo")[^>]*>(.*?)</(?:p|div|a)>', text, re.S)
            serif_text = unescape(re.sub(r'<[^>]*>', '', ''.join(part for _, part in fragments) + ''.join(extra)))
            wanted = present & ({ord(c) for c in serif_text} | set(range(32, 127)))
        options = subset.Options()
        options.flavor = 'woff2'
        sub = subset.Subsetter(options=options)
        sub.populate(unicodes=wanted)
        sub.subset(font)
        if axes:
            font = instantiateVariableFont(font, axes, inplace=True)
        name = f'{page}-{stem}.woff2'
        font.flavor = 'woff2'
        font.save(OUT/name)
        css.append(f"@font-face{{font-family:'{family}';font-style:{style};font-weight:{weight};font-display:swap;src:url(fonts/pages/{name}) format('woff2')}}")
        manifest.append({'page':page, 'family':family, 'file':name, 'bytes':(OUT/name).stat().st_size, 'source':stem+'.woff2', 'characters':len(wanted)})
    generated_css = '\n'.join(css)+'\n'
    (ROOT/f'assets/fonts-{page}.css').write_text(generated_css, encoding='utf-8')
    html = path.read_text(encoding='utf-8')
    if '<style id="page-fonts">' in html:
        prefix = 'assets/' if page == 'index' else '../assets/'
        inline = generated_css.replace('url(fonts/', f'url({prefix}fonts/')
        html = re.sub(r'(<style id="page-fonts">).*?(</style>)', lambda match: match[1]+'\n'+inline+match[2], html, flags=re.S)
        path.write_text(html, encoding='utf-8')
    print(page, sum(r['bytes'] for r in manifest if r['page']==page), flush=True)
(OUT/'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n', encoding='utf-8')
