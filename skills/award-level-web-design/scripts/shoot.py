#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["playwright>=1.50,<2"]
# ///
"""Capture responsive pages and explicitly configured UI states with Playwright."""

import argparse
import json
import math
import os
from pathlib import Path
import re
import shutil
import sys

from audit import audit_page
from performance import PERFORMANCE_INIT_JS, collect_performance


DEFAULT_WIDTHS = (375, 768, 1280, 1920)
WAIT_STATES = ('visible', 'hidden', 'attached', 'detached')
ACTION_TYPES = ('click', 'fill', 'press', 'hover', 'wait')


def slug(value):
    return re.sub(r'[^\w-]+', '-', value, flags=re.UNICODE).strip('-').lower()


def parse_widths(value):
    try:
        widths = [int(part.strip()) for part in value.split(',')]
    except ValueError as error:
        raise argparse.ArgumentTypeError('widths must be comma-separated integers') from error
    if not widths or len(set(widths)) != len(widths) or any(w < 100 or w > 7680 for w in widths):
        raise argparse.ArgumentTypeError('unique widths must be between 100 and 7680')
    return widths


def nonnegative(value):
    number = float(value)
    if not math.isfinite(number) or number < 0:
        raise argparse.ArgumentTypeError('value must be finite and nonnegative')
    return number


def positive_int(value):
    number = int(value)
    if number <= 0:
        raise argparse.ArgumentTypeError('value must be a positive integer')
    return number


def parser():
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument('target', help='http(s) URL or local HTML file')
    result.add_argument('--out', type=Path, default=Path('shots'))
    result.add_argument('--widths', type=parse_widths, default=list(DEFAULT_WIDTHS))
    result.add_argument('--sections', default='', help='comma-separated CSS selectors')
    result.add_argument('--full', action='store_true')
    result.add_argument('--max-height', type=positive_int, default=16000)
    result.add_argument('--audit', action='store_true')
    result.add_argument('--max-issues', type=int, default=12, help='display limit; counts remain complete')
    result.add_argument('--perf', action='store_true')
    result.add_argument('--axe', action='store_true')
    result.add_argument('--axe-source', type=Path, help='local axe.min.js; implies --axe')
    result.add_argument('--states', type=Path, help='JSON with states, actions and expectations')
    result.add_argument('--reduced-motion', action='store_true', help='also capture each run with reduce enabled')
    result.add_argument('--ready-selector', help='wait until this CSS selector is visible')
    result.add_argument('--ready-js', help='wait for this JavaScript predicate to become truthy')
    result.add_argument('--timeout', type=positive_int, default=20000, help='per-operation timeout in milliseconds')
    result.add_argument('--settle', type=nonnegative, default=500, help='additional wait in milliseconds')
    result.add_argument('--chrome', type=Path, help='browser executable; also reads CHROME')
    result.add_argument('--headed', action='store_true')
    result.add_argument('--fail-on-error', action='store_true', help='exit 1 for confirmed audit/axe/state/runtime failures')
    for name, default in [('lcp', 2500), ('cls', .1), ('bytes', 1500000), ('font-bytes', 300000)]:
        result.add_argument('--max-' + name, type=nonnegative, default=default)
    return result


def resolve_target(value):
    if value.startswith(('http://', 'https://', 'file://')):
        return value
    path = Path(value).expanduser().resolve()
    if not path.is_file():
        raise ValueError(f'HTML file does not exist: {path}')
    return path.as_uri()


def load_states(path):
    if path is None:
        return []
    data = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(data, dict) or not isinstance(data.get('states'), list):
        raise ValueError('state configuration must contain a states array')
    names = set()
    for state in data['states']:
        if not isinstance(state, dict) or not isinstance(state.get('name'), str) or not slug(state['name']):
            raise ValueError('each state needs a nonempty name')
        name = slug(state['name'])
        if name in names:
            raise ValueError(f'duplicate screenshot state name: {name}')
        names.add(name)
        actions, expectations = state.get('actions', []), state.get('expect', [])
        if not isinstance(actions, list) or not isinstance(expectations, list):
            raise ValueError('actions and expect must be arrays')
        for action in actions:
            if not isinstance(action, dict) or action.get('type') not in ACTION_TYPES:
                raise ValueError(f'action type must be one of {ACTION_TYPES}')
            _selector(action)
            if action['type'] == 'fill' and not isinstance(action.get('value'), str):
                raise ValueError('fill requires a string value')
            if action['type'] == 'press' and not isinstance(action.get('key'), str):
                raise ValueError('press requires a string key')
            if action['type'] == 'wait' and action.get('state', 'visible') not in WAIT_STATES:
                raise ValueError(f'wait state must be one of {WAIT_STATES}')
        for expectation in expectations:
            if not isinstance(expectation, dict):
                raise ValueError('expectation must be an object')
            _selector(expectation)
            if expectation.get('state', 'visible') not in WAIT_STATES:
                raise ValueError(f'expectation state must be one of {WAIT_STATES}')
    return data['states']


def _selector(item):
    if not isinstance(item.get('selector'), str) or not item['selector'].strip():
        raise ValueError('each action/expectation needs a selector')


def browser_path(explicit):
    given = explicit or os.environ.get('CHROME')
    if given:
        path = Path(given).expanduser().resolve()
        if not path.is_file():
            raise ValueError(f'browser executable not found: {path}')
        return str(path)
    candidates = [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ]
    if sys.platform == 'win32':
        for variable in ('PROGRAMFILES', 'PROGRAMFILES(X86)', 'LOCALAPPDATA'):
            base = os.environ.get(variable)
            if base:
                candidates += [str(Path(base) / 'Google/Chrome/Application/chrome.exe'),
                               str(Path(base) / 'Microsoft/Edge/Application/msedge.exe')]
    candidates += [shutil.which(name) for name in ('google-chrome', 'chromium', 'chromium-browser', 'microsoft-edge')]
    return next((str(p) for p in candidates if p and Path(p).is_file()), None)


def wait_ready(page, args):
    if args.ready_selector:
        page.locator(args.ready_selector).wait_for(state='visible')
    if args.ready_js:
        page.wait_for_function(args.ready_js)
    page.wait_for_function("document.fonts.status === 'loaded'")
    page.wait_for_function("""() => [...document.images].filter(img => {
      const r = img.getBoundingClientRect();
      return r.bottom > 0 && r.top < innerHeight && r.width && r.height;
    }).every(img => img.complete)""")
    page.wait_for_function("""() => !document.getAnimations().some(a => {
      const t = a.effect?.getComputedTiming(), el = a.effect?.target;
      if (a.playState !== 'running' || !t || t.iterations === Infinity || t.activeDuration > 5000 || !el?.getBoundingClientRect) return false;
      const r = el.getBoundingClientRect();
      return r.bottom > 0 && r.top < innerHeight && r.width > 0 && r.height > 0;
    })""")
    if args.settle:
        page.wait_for_timeout(args.settle)


def perform_actions(page, state):
    for action in state.get('actions', []):
        element = page.locator(action['selector'])
        kind = action['type']
        if kind == 'click':
            element.click()
        elif kind == 'fill':
            element.fill(action['value'])
        elif kind == 'press':
            element.press(action['key'])
        elif kind == 'hover':
            element.hover()
        else:
            element.wait_for(state=action.get('state', 'visible'))
    for expectation in state.get('expect', []):
        page.locator(expectation['selector']).wait_for(state=expectation.get('state', 'visible'))


def connect_network(context, page):
    session = context.new_cdp_session(page)
    resources = {}

    def response(event):
        resources[event['requestId']] = dict(type=event['type'], url=event['response']['url'], bytes=0, transferBytes=0)

    def received(event):
        resource = resources.get(event['requestId'])
        if resource is not None:
            resource['bytes'] += event['dataLength']

    def finished(event):
        resource = resources.get(event['requestId'])
        if resource is not None:
            resource['transferBytes'] = event['encodedDataLength']

    session.on('Network.responseReceived', response)
    session.on('Network.dataReceived', received)
    session.on('Network.loadingFinished', finished)
    session.send('Network.enable')
    session.send('Network.setCacheDisabled', {'cacheDisabled': True})
    return resources


def capture_run(browser, target, width, mode, state, args, axe_source):
    height = 844 if width < 768 else 1024 if width < 1200 else 1080 if width >= 1900 else 900
    label = 'base' if state is None else 'state-' + slug(state['name'])
    prefix = f'{width}-{mode}-{label}'
    result = dict(name='base' if state is None else state['name'], status='captured', screenshots=[],
                  assertions=[] if state is None else state.get('expect', []), warnings=[], runtimeErrors=[], failedRequests=[])
    context = browser.new_context(viewport={'width': width, 'height': height}, device_scale_factor=2 if width < 768 else 1,
                                  is_mobile=width < 768, has_touch=width < 768, reduced_motion='reduce' if mode == 'reduce' else 'no-preference')
    try:
        context.set_default_timeout(args.timeout)
        context.set_default_navigation_timeout(args.timeout)
        if args.perf:
            context.add_init_script(PERFORMANCE_INIT_JS)
        page = context.new_page()
        page.on('pageerror', lambda error: result['runtimeErrors'].append(str(error)))
        page.on('requestfailed', lambda request: result['failedRequests'].append(dict(url=request.url, reason=request.failure)))
        page.on('response', lambda response: result['failedRequests'].append(dict(url=response.url, status=response.status))
                if response.status >= 400 else None)
        resources = connect_network(context, page) if args.perf else {}
        response = page.goto(target, wait_until='load')
        if response and response.status >= 400:
            raise RuntimeError(f'Navigation returned HTTP {response.status}')
        wait_ready(page, args)
        if state is not None:
            perform_actions(page, state)
            wait_ready(page, args)
            if state.get('expect'):
                result['status'] = 'passed'
            else:
                result['warnings'].append('Actions captured without explicit expectations; resulting behavior remains unverified.')

        def save(suffix, **options):
            path = args.out / f'{prefix}-{suffix}.png'
            page.screenshot(path=str(path), **options)
            result['screenshots'].append(str(path))

        save('top')
        # Audit the configured state before scrolling changes focus or sticky UI.
        if args.audit:
            result['audit'] = audit_page(page, max_issues=args.max_issues, reduced_motion=mode == 'reduce')
        if axe_source:
            page.evaluate(axe_source)
            result['axe'] = page.evaluate("""async timeout => {
              let timer;
              try {
                const r = await Promise.race([
                  axe.run(document, {resultTypes:['violations','incomplete'],
                    runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','best-practice']}}),
                  new Promise((_, reject) => {timer = setTimeout(() => reject(new Error('axe scan timed out')), timeout)})
                ]);
                return {version:r.testEngine.version,violations:r.violations,incomplete:r.incomplete,
                  note:'Automatic scan only; keyboard, pause behavior and screen-reader experience require manual verification.'};
              } finally { clearTimeout(timer); }
            }""", args.timeout)
        for index, selector in enumerate(filter(None, (s.strip() for s in args.sections.split(',')))):
            element = page.locator(selector).first
            if not element.count():
                result['warnings'].append(f'Section selector not found: {selector}')
                continue
            element.scroll_into_view_if_needed()
            wait_ready(page, args)
            save(f'section-{index + 1}-{slug(selector) or "element"}')
        if args.full:
            maximum = min(page.evaluate('document.documentElement.scrollHeight'), args.max_height)
            step = max(1, int(height * .8))
            for y in range(0, int(maximum), step):
                page.evaluate('(y) => scrollTo(0, y)', y)
                wait_ready(page, args)
            page.evaluate('scrollTo(0, 0)')
            wait_ready(page, args)
            actual = page.evaluate('document.documentElement.scrollHeight')
            result['fullPage'] = dict(height=actual, capturedHeight=min(actual, args.max_height), truncated=actual > args.max_height)
            if actual > args.max_height:
                result['warnings'].append(f'Full screenshot truncated at {args.max_height}px; page height is {actual}px.')
                save('full', full_page=True, clip={'x': 0, 'y': 0, 'width': width, 'height': args.max_height})
            else:
                save('full', full_page=True)
        if args.perf:
            limits = dict(lcp=args.max_lcp, cls=args.max_cls, totalBytes=args.max_bytes, fontBytes=args.max_font_bytes)
            result['perf'] = collect_performance(page, list(resources.values()), limits, full=args.full)
            if state is not None:
                result['perf']['scope'] += '; includes configured state interactions'
            if result.get('fullPage', {}).get('truncated'):
                result['perf']['scope'] += '; scroll/capture height capped, later lazy resources may be excluded'
        result['missingImages'] = page.evaluate("""() => [...document.images].filter(img => {
          const r = img.getBoundingClientRect(), cs = getComputedStyle(img);
          return img.complete && img.naturalWidth === 0 && (img.currentSrc || img.getAttribute('src')) &&
            r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility === 'visible';
        }).map(img => ({src:img.currentSrc || img.src,alt:img.alt}))""")
        if result['runtimeErrors'] or result['missingImages']:
            result['status'] = 'failed'
    except Exception as error:
        result['status'] = 'failed'
        result['error'] = str(error)
        if 'page' in locals() and not page.is_closed():
            try:
                path = args.out / f'{prefix}-failed.png'
                page.screenshot(path=str(path), timeout=min(args.timeout, 3000))
                result['screenshots'].append(str(path))
            except Exception:
                pass
    finally:
        context.close()
    return result


def run_results(report):
    for modes in report.get('runs', {}).values():
        for mode in modes.values():
            yield mode['base']
            yield from mode['states']


def has_failures(report):
    return bool(report.get('error')) or any(
        run.get('status') == 'failed' or run.get('audit', {}).get('errors', 0) or
        run.get('axe', {}).get('violations') for run in run_results(report))


def write_reports(report, args):
    (args.out / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    if args.audit:
        audits = {w: {m: {'base': r['base'].get('audit'), 'states': [s.get('audit') for s in r['states']]}
                      for m, r in modes.items()} for w, modes in report['runs'].items()}
        (args.out / 'audit.json').write_text(json.dumps(audits, ensure_ascii=False, indent=2), encoding='utf-8')


def main(argv=None):
    arguments = parser()
    args = arguments.parse_args(argv)
    try:
        if args.max_issues < 0:
            raise ValueError('--max-issues must be nonnegative')
        target = resolve_target(args.target)
        states = load_states(args.states)
        if args.axe and args.axe_source is None:
            raise ValueError('--axe requires --axe-source pointing to a local axe.min.js')
        axe_source = args.axe_source.read_text(encoding='utf-8') if args.axe_source else None
        executable = browser_path(args.chrome)
    except (OSError, ValueError) as error:
        arguments.error(str(error))
    args.out = args.out.expanduser().resolve()
    args.out.mkdir(parents=True, exist_ok=True)
    report = dict(schemaVersion=1, target=target, widths=args.widths, runs={}, unverified=[
        'Keyboard and screen-reader behavior, focus management and pause controls need manual testing.',
        'JS timers, canvas/video motion and user preference changes need manual testing.',
        'Only configured states and expectations are exercised; screenshots do not prove all interactions work.',
    ])
    if not states:
        report['unverified'].append('No interaction states were configured.')
    if not args.reduced_motion:
        report['unverified'].append('Reduced-motion mode was not exercised.')
    if not axe_source:
        report['unverified'].append('axe-core scan was not requested.')
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=not args.headed, executable_path=executable)
            try:
                for width in args.widths:
                    report['runs'][str(width)] = {}
                    for mode in ('normal', 'reduce') if args.reduced_motion else ('normal',):
                        base = capture_run(browser, target, width, mode, None, args, axe_source)
                        results = [capture_run(browser, target, width, mode, state, args, axe_source) for state in states]
                        report['runs'][str(width)][mode] = dict(base=base, states=results)
                        count = base.get('audit', {}).get('errors', 'not run')
                        print(f'[{width}px {mode}] {base["status"]}; audit errors: {count}; states: {len(results)}')
            finally:
                browser.close()
    except Exception as error:
        report['error'] = str(error)
        write_reports(report, args)
        print(f'Browser verification failed: {error}\nReport: {args.out / "report.json"}', file=sys.stderr)
        return 2
    write_reports(report, args)
    print(f'Report: {args.out / "report.json"}')
    return 1 if args.fail_on_error and has_failures(report) else 0


if __name__ == '__main__':
    sys.exit(main())
