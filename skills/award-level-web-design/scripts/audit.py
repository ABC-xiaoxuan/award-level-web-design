"""DOM-based design checks; Playwright is supplied by the caller, not imported here."""

import math
import re


_COLLECT = r"""() => {
  const vw = document.documentElement.clientWidth;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d', {willReadFrequently: true});
  function color(value) {
    if (!ctx || !CSS.supports('color', value)) return null;
    try {
      ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = value; ctx.fillRect(0, 0, 1, 1);
      const [r,g,b,a] = ctx.getImageData(0, 0, 1, 1).data;
      return [r,g,b,a / 255];
    } catch { return null; }
  }
  const cached = new WeakMap();
  function layer(el) {
    if (cached.has(el)) return cached.get(el);
    const cs = getComputedStyle(el);
    const pseudo = ['::before', '::after'].some(p => {
      const s = getComputedStyle(el, p), c = color(s.backgroundColor);
      return !['none', 'normal', ''].includes(s.content) &&
        (s.backgroundImage !== 'none' || (c && c[3] > 0));
    });
    const value = {color: color(cs.backgroundColor), image: cs.backgroundImage,
      opacity: Number(cs.opacity), filter: cs.filter, blend: cs.mixBlendMode, pseudo};
    cached.set(el, value); return value;
  }
  function target(el) {
    const classes = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean).slice(0,2) : [];
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
      (classes.length ? '.' + classes.join('.') : '') +
      ' ' + (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0,40);
  }
  function headingLines(el, size) {
    if (!el.matches('h1,h2,h3,blockquote,[class*="title"],[class*="headline"]') || size < 24 || el.textContent.length > 160) return null;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    const lines = []; let seg = 0, lastBlock = null;
    for (let n; (n = walker.nextNode());) {
      if (n.nodeType === 1) { if (n.tagName === 'BR') seg++; continue; }
      let block = el;
      for (let p = n.parentElement; p && p !== el; p = p.parentElement) {
        if (!getComputedStyle(p).display.startsWith('inline')) { block = p; break; }
      }
      if (lastBlock && block !== lastBlock) seg++; lastBlock = block;
      for (let i = 0; i < n.textContent.length; i++) {
        const range = document.createRange(); range.setStart(n,i); range.setEnd(n,i+1);
        const r = range.getClientRects()[0]; if (!r || !r.width) continue;
        let line = lines.find(l => Math.abs(l.top - r.top) < size * .5);
        if (!line) { line = {top:r.top, chars:[]}; lines.push(line); }
        line.chars.push({char:n.textContent[i], seg});
      }
    }
    return lines.sort((a,b) => a.top - b.top);
  }
  const elements = []; let hidden = 0;
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    if (cs.display === 'none' || cs.visibility !== 'visible' || !r.width || !r.height) { hidden++; continue; }
    const clip = {left:r.left,right:r.right,top:r.top,bottom:r.bottom};
    const layers = []; let invisible = false;
    for (let p = el; p; p = p.parentElement) {
      const l = layer(p); layers.push(l); if (l.opacity === 0) invisible = true;
      if (p === el || p === document.body || p === document.documentElement) continue;
      const s = getComputedStyle(p), pr = p.getBoundingClientRect();
      if (/auto|scroll|hidden|clip/.test(s.overflowX)) { clip.left=Math.max(clip.left,pr.left); clip.right=Math.min(clip.right,pr.right); }
      if (/auto|scroll|hidden|clip/.test(s.overflowY)) { clip.top=Math.max(clip.top,pr.top); clip.bottom=Math.min(clip.bottom,pr.bottom); }
    }
    if (invisible || clip.right <= clip.left || clip.bottom <= clip.top) { hidden++; continue; }
    const text = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
    const size = parseFloat(cs.fontSize);
    elements.push({target:target(el), text, rect:{left:r.left,right:r.right,width:r.width,height:r.height}, clip,
      color:color(cs.color), layers, size, weight:parseInt(cs.fontWeight), font:cs.fontFamily,
      interactive:el.matches('a[href],button,input,select,textarea,[role="button"],[role="tab"]'),
      inline_link:el.matches('a[href]') && cs.display === 'inline' && !!el.closest('p,li'),
      image:el.tagName === 'IMG' ? {width:el.getAttribute('width'),height:el.getAttribute('height'),ratio:cs.aspectRatio,
        fixed_css:!!el.style.width && !!el.style.height} : null,
      lines:headingLines(el,size)});
  }
  const animations = document.getAnimations ? document.getAnimations().map(a => {
    const timing = a.effect?.getComputedTiming(), el = a.effect?.target;
    return {state:a.playState,target:el?.tagName ? target(el) : null,
      infinite:timing?.iterations === Infinity, duration:Number(timing?.activeDuration) || 0,
      essential:!!el?.closest?.('[data-motion-essential="true"]')};
  }).filter(a => a.state === 'running') : [];
  return {viewport:vw,scroll_width:document.documentElement.scrollWidth,elements,hidden,
    animations,animations_supported:!!document.getAnimations,
    reduced_motion:matchMedia('(prefers-reduced-motion: reduce)').matches};
}"""

_CJK = re.compile(r"[㐀-鿿豈-﫿]")
_CJK_FONT = re.compile(
    r"noto (sans|serif) (sc|tc|jp|kr|cjk)|source han|思源|pingfang|hiragino|"
    r"microsoft yahei|微软雅黑|simsun|宋体|simhei|黑体|songti|heiti|lxgw|霞鹜|"
    r"harmonyos|misans|alibaba|smiley|zcool|ma shan|long cang|zhi mang|liu jian", re.I
)

_REDUCED_SETTLE = """() => new Promise(resolve => {
  let finished = false;
  const finish = () => { if (!finished) { finished = true; clearTimeout(timer); resolve(); } };
  const timer = setTimeout(finish, 200);
  requestAnimationFrame(() => requestAnimationFrame(finish));
})"""


def _rgb(color):
    if not isinstance(color, (list, tuple)) or len(color) != 4:
        return None
    try:
        values = [float(v) for v in color]
    except (TypeError, ValueError):
        return None
    return values if all(math.isfinite(v) for v in values) else None


def _blend(top, bottom):
    return [top[i] * top[3] + bottom[i] * (1 - top[3]) for i in range(3)]


def _contrast(foreground, background):
    def luminance(rgb):
        values = [v / 255 for v in rgb]
        linear = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in values]
        return sum(v * w for v, w in zip(linear, (.2126, .7152, .0722)))
    a, b = sorted((luminance(_blend(foreground, background)), luminance(background)))
    return (b + .05) / (a + .05)


def _background(layers):
    if any(l.get('opacity', 1) < 1 for l in layers):
        return None, 'Ancestor or element opacity requires compositing review.'
    if any(l.get('filter', 'none') != 'none' or l.get('blend', 'normal') != 'normal' for l in layers):
        return None, 'Filters or blend modes require visual review.'
    colors = []
    for layer in layers:
        if layer.get('image', 'none') != 'none' or layer.get('pseudo'):
            return None, 'Image, gradient or pseudo-element background requires visual review.'
        color = _rgb(layer.get('color'))
        if color is None:
            return None, 'Background color could not be normalized to sRGB.'
        colors.append(color)
        if color[3] >= 1:
            break
    background = [255, 255, 255]
    for color in reversed(colors):
        background = _blend(color, background)
    return background, None


def audit_page(page, *, max_issues=12, reduced_motion=False):
    """Audit a synchronous Playwright Page. ``unchecked`` is a list, not a pass.

    Reduced-motion auditing emulates ``reduce`` and leaves that preference active.
    The caller should wait for application-specific readiness before calling.
    """
    if not isinstance(max_issues, int) or isinstance(max_issues, bool) or max_issues < 0:
        raise ValueError('max_issues must be a non-negative integer')
    if reduced_motion:
        page.emulate_media(reduced_motion='reduce')
        page.evaluate(_REDUCED_SETTLE)
    data = page.evaluate(_COLLECT)
    issues, unchecked = [], []
    checked_text = 0

    def add(check, severity, target, detail):
        issues.append(dict(check=check, severity=severity, target=target, detail=detail))

    def unknown(check, target, detail):
        unchecked.append(dict(check=check, target=target, detail=detail))

    viewport = data['viewport']
    if data.get('scroll_width', viewport) > viewport + 1:
        add('overflow', 'error', None, f"scrollWidth {data['scroll_width']}px > viewport {viewport}px")
    seen_fonts = set()
    for el in data.get('elements', []):
        target, text = el['target'], el.get('text', '')
        rect, clip = el.get('rect', {}), el.get('clip', el.get('rect', {}))
        if ((clip.get('right', 0) > viewport + 1 and clip.get('left', 0) < viewport) or
                (clip.get('left', 0) < -1 and clip.get('right', 0) > 0)):
            add('overflow', 'error', target, 'Visible element extends beyond the horizontal viewport.')
        if viewport < 768 and el.get('interactive') and not el.get('inline_link'):
            if rect.get('width', 0) < 44 or rect.get('height', 0) < 44:
                add('tap-target', 'warn', target, f"{rect.get('width', 0):g}×{rect.get('height', 0):g}px; aim for 44×44px.")
        image = el.get('image')
        if image and not ((image.get('width') and image.get('height')) or image.get('ratio', 'auto') != 'auto' or image.get('fixed_css')):
            add('img-size', 'warn', target, 'Reserve image space using both dimensions or an aspect-ratio; verify stylesheet sizing manually.')
        if text:
            background, reason = _background(el.get('layers', []))
            foreground = _rgb(el.get('color'))
            if foreground is None:
                unknown('contrast', target, 'Text color could not be normalized to sRGB.')
            elif reason:
                unknown('contrast', target, reason)
            else:
                checked_text += 1
                ratio = _contrast(foreground, background)
                large = el.get('size', 16) >= 24 or (el.get('weight', 400) >= 700 and el.get('size', 16) >= 18.66)
                need = 3 if large else 4.5
                if ratio < need:
                    add('contrast', 'error', target, f'{ratio:.2f}:1; requires {need}:1.')
            font = el.get('font', '')
            if _CJK.search(text) and font not in seen_fonts and not _CJK_FONT.search(font):
                seen_fonts.add(font)
                add('cjk-font-fallback', 'warn', target, f'font-family: {font}; verify actual CJK glyph rendering.')
        lines = el.get('lines') or []
        if len(lines) >= 2 and sum(len(l['chars']) for l in lines) >= 6:
            last = [c for c in lines[-1]['chars'] if not c['char'].isspace()]
            if last and any(c['seg'] == last[0]['seg'] for c in lines[-2]['chars'] if not c['char'].isspace()):
                final = ''.join(c['char'] for c in lines[-1]['chars']).strip()
                units = len(re.sub(r'[\s，。、；：！？”’）》,.;:!?)]', '', final)) if _CJK.search(final) else len(final.split())
                if units <= (2 if _CJK.search(final) else 1):
                    add('orphan', 'warn', target, f'Last wrapped line contains only "{final}"; review the heading break.')
    if reduced_motion:
        if not data.get('reduced_motion'):
            unknown('reduced-motion', None, 'The page did not report the requested reduce preference.')
        if not data.get('animations_supported', True):
            unknown('reduced-motion', None, 'Browser animation enumeration is unavailable.')
        for animation in data.get('animations', []):
            if animation.get('state') != 'running' or not (animation.get('infinite') or animation.get('duration', 0) > 5000):
                continue
            if animation.get('essential'):
                unknown('reduced-motion', animation.get('target'), 'Marked essential; justify the exception manually.')
            else:
                add('reduced-motion', 'error', animation.get('target'), 'Continuous or >5s animation is still running with reduce enabled.')
    else:
        unknown('reduced-motion', None, 'Reduced-motion behavior was not exercised; run with reduced_motion=True.')
    displayed = sorted(issues, key=lambda issue: issue['severity'] != 'error')[:max_issues]
    return dict(viewport=viewport, errors=sum(i['severity'] == 'error' for i in issues),
                warnings=sum(i['severity'] == 'warn' for i in issues), issues=displayed,
                omitted=max(0, len(issues) - max_issues), unchecked=unchecked,
                coverage=dict(scope='Visible DOM content, excluding fully hidden or locally clipped elements.',
                              sampled_elements=len(data.get('elements', [])), hidden_elements=data.get('hidden', 0),
                              contrast_checked=checked_text, reduced_motion_requested=reduced_motion,
                              automatic=['horizontal overflow', 'solid-background text contrast', '44px target heuristic',
                                         'CJK font-stack heuristic', 'heading orphans', 'image dimensions', 'running Web Animations'],
                              manual=['Keyboard and screen-reader behavior', 'hover/focus/active states',
                                      'JS timers, canvas/video motion, pause controls and essential-motion exceptions',
                                      'Overlays, complex compositing, actual font glyph selection and stylesheet image sizing']))
