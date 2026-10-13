/*
 * audit.js — automated checks for the award-level-web-design self-review.
 *
 * Runs inside the page. Two ways to use it:
 *   1. shoot.mjs --audit   (runs it at every viewport width and saves audit.json)
 *   2. Paste/evaluate the whole file in any browser tool's JS console; the last
 *      expression returns the report object.
 *
 * It only reports things a script can judge reliably. Taste (composition,
 * concept, hierarchy) still needs a human/LLM looking at screenshots.
 */
(() => {
  const vw = document.documentElement.clientWidth;
  const issues = [];
  const add = (check, severity, el, detail) => {
    if (issues.filter(i => i.check === check).length >= 12) return; // keep the report short
    issues.push({ check, severity, target: el ? describe(el) : null, detail });
  };
  function describe(el) {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 2) : [];
    if (cls.length) s += '.' + cls.join('.');
    const text = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30);
    return text ? `${s} "${text}"` : s;
  }
  const visible = el => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const CJK = /[㐀-鿿豈-﫿]/;
  const ownText = el => [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();

  // 1. Horizontal overflow (also catches overflow hidden by body{overflow-x:clip})
  const sw = document.documentElement.scrollWidth;
  if (sw > vw + 1) add('overflow', 'error', null, `scrollWidth ${sw}px > viewport ${vw}px`);
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 && r.left < vw) {
      // ignore children of an element that is itself already reported, and intentional scrollers
      let p = el.parentElement, skip = false;
      while (p && p !== document.body) {
        const cs = getComputedStyle(p);
        if (/(auto|scroll|hidden|clip)/.test(cs.overflowX)) { skip = true; break; }
        p = p.parentElement;
      }
      if (!skip) add('overflow', 'error', el, `right edge at ${Math.round(r.right)}px, viewport ${vw}px`);
    }
  }

  // 2. Text contrast (solid backgrounds only; elements over images/gradients are skipped)
  const parse = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] }; };
  const lum = ({ r, g, b }) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
  function bgOf(el) {
    let layers = [];
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage !== 'none') return null; // can't judge reliably
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    }
    let out = { r: 255, g: 255, b: 255 };
    for (const c of layers.reverse()) out = { r: c.r * c.a + out.r * (1 - c.a), g: c.g * c.a + out.g * (1 - c.a), b: c.b * c.a + out.b * (1 - c.a) };
    return out;
  }
  // colors caught mid-transition give bogus ratios, so skip anything currently animating
  const animating = new Set(document.getAnimations().filter(a => a.playState === 'running' && a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.effect?.target));
  const isAnimating = el => { for (let n = el; n; n = n.parentElement) if (animating.has(n)) return true; return false; };
  for (const el of document.querySelectorAll('body *')) {
    const t = ownText(el);
    if (!t || !visible(el)) continue;
    const cs = getComputedStyle(el);
    if (parseFloat(cs.opacity) < 1 || isAnimating(el)) continue;
    const fg = parse(cs.color), bg = bgOf(el);
    if (!fg || !bg) continue;
    const blended = { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) };
    const L1 = lum(blended), L2 = lum(bg), ratio = (Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05);
    const size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight) >= 700;
    const large = size >= 24 || (bold && size >= 18.66);
    const need = large ? 3 : 4.5;
    if (ratio < need) add('contrast', ratio < need - 1 ? 'error' : 'warn', el, `${ratio.toFixed(2)}:1, needs ${need}:1 (${Math.round(size)}px)`);
  }

  // 3. Tap targets (phones/tablets only)
  if (vw < 768) {
    for (const el of document.querySelectorAll('a[href], button, input, select, textarea, [role="button"], [role="tab"]')) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      const inline = getComputedStyle(el).display === 'inline' && el.closest('p, li');
      if (inline) continue; // links inside running text are exempt
      if (r.width < 44 && r.height < 44) add('tap-target', 'warn', el, `${Math.round(r.width)}×${Math.round(r.height)}px, aim for ≥ 44px`);
    }
  }

  // 4. CJK text whose font stack has no CJK family (falls back to SimSun etc. on Windows)
  const CJK_FAMILIES = /noto (sans|serif) (sc|tc|jp|kr|cjk)|source han|思源|pingfang|hiragino|microsoft yahei|微软雅黑|yahei|simsun|宋体|simhei|黑体|songti|heiti|lxgw|霞鹜|harmonyos|misans|alibaba|smiley|zcool|ma shan|long cang|zhi mang|liu jian|ZCOOL/i;
  const seen = new Set();
  for (const el of document.querySelectorAll('body *')) {
    const t = ownText(el);
    if (!t || !CJK.test(t) || !visible(el)) continue;
    const ff = getComputedStyle(el).fontFamily;
    if (seen.has(ff)) continue;
    if (!CJK_FAMILIES.test(ff)) { seen.add(ff); add('cjk-font-fallback', 'warn', el, `font-family: ${ff} — add a CJK family (e.g. "Noto Sans SC") before the generic`); }
  }

  // 5. Orphans: big headings whose last line holds only 1–2 characters/words
  for (const el of document.querySelectorAll('h1, h2, h3, blockquote, [class*="title"], [class*="headline"]')) {
    if (!visible(el)) continue;
    const size = parseFloat(getComputedStyle(el).fontSize);
    const text = el.textContent.trim();
    if (size < 24 || !text || text.length > 160) continue;
    // Walk text + <br>. A "segment" is a run of text with no forced break (a <br> or a
    // different block-level container). Only a short last line that wrapped *within*
    // a segment is an orphan; deliberate breaks are fine.
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    const blockOf = n => { for (let p = n.parentElement; p && p !== el; p = p.parentElement) if (!getComputedStyle(p).display.startsWith('inline')) return p; return el; };
    const chars = []; let seg = 0, lastBlock = null;
    for (let n; (n = walker.nextNode());) {
      if (n.nodeType === 1) { if (n.tagName === 'BR') seg++; continue; }
      const b = blockOf(n); if (lastBlock && b !== lastBlock) seg++; lastBlock = b;
      for (let i = 0; i < n.textContent.length; i++) {
        const ch = n.textContent[i];
        const rg = document.createRange(); rg.setStart(n, i); rg.setEnd(n, i + 1);
        const rc = rg.getClientRects()[0];
        if (/\s/.test(ch)) { if (chars.length) chars.push({ ch: ' ', top: chars.at(-1).top, seg }); continue; }
        if (rc && rc.width) chars.push({ ch, top: Math.round(rc.top), seg });
      }
    }
    if (chars.filter(c => c.ch !== ' ').length < 6) continue;
    const lines = [];
    for (const c of chars) { const l = lines.find(l => Math.abs(l.top - c.top) < size * .5); l ? l.c.push(c) : lines.push({ top: c.top, c: [c] }); }
    if (lines.length < 2) continue;
    lines.sort((a, b) => a.top - b.top);
    const lastL = lines.at(-1), prevL = lines.at(-2);
    const lastSeg = lastL.c.find(c => c.ch !== ' ').seg;
    if (!prevL.c.some(c => c.ch !== ' ' && c.seg === lastSeg)) continue; // forced break before the last line
    const last = lastL.c.map(c => c.ch).join('').trim();
    const units = CJK.test(last) ? last.replace(/[\s，。、；：！？”’）》,.;:!?)]/g, '').length : last.split(/\s+/).length;
    if (units <= (CJK.test(last) ? 2 : 1)) add('orphan', 'warn', el, `last line is only "${last}" — rebreak with <br>, nowrap phrases + <wbr>, or resize`);
  }

  // 6. Images without intrinsic size (layout shift)
  for (const img of document.querySelectorAll('img')) {
    if (!img.getAttribute('width') && !img.getAttribute('height') && !getComputedStyle(img).aspectRatio.includes('/')) add('img-size', 'warn', img, 'missing width/height or aspect-ratio');
  }

  // 7. Reduced-motion support present?
  const css = [...document.styleSheets].map(s => { try { return [...s.cssRules].map(r => r.cssText).join('\n'); } catch { return ''; } }).join('\n');
  if (/animation|transition/.test(css) && !/prefers-reduced-motion/.test(css)) add('reduced-motion', 'warn', null, 'page animates but has no @media (prefers-reduced-motion) rule');

  const count = s => issues.filter(i => i.severity === s).length;
  return { viewport: vw, errors: count('error'), warnings: count('warn'), issues };
})();
