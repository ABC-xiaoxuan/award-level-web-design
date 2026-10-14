"""Collect a single unthrottled browser performance sample and CDP byte totals."""

import math


# Installed before navigation: these browser APIs cannot be queried from Python.
PERFORMANCE_INIT_JS = """(() => {
  const metrics = {lcp: null, cls: null, supported: []};
  window.__shootPerformance = metrics;
  if (typeof PerformanceObserver === 'undefined') return;
  const types = PerformanceObserver.supportedEntryTypes || [];
  if (types.includes('largest-contentful-paint')) {
    try {
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) metrics.lcp = entry.startTime;
      }).observe({type: 'largest-contentful-paint', buffered: true});
      metrics.supported.push('largest-contentful-paint');
    } catch (_) {}
  }
  if (types.includes('layout-shift')) {
    let sessionStart = null, lastShift = 0, sessionValue = 0;
    try {
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (entry.hadRecentInput) continue;
          if (sessionStart === null || entry.startTime - lastShift >= 1000 ||
              entry.startTime - sessionStart >= 5000) {
            sessionStart = entry.startTime;
            sessionValue = 0;
          }
          lastShift = entry.startTime;
          sessionValue += entry.value;
          metrics.cls = Math.max(metrics.cls, sessionValue);
        }
      }).observe({type: 'layout-shift', buffered: true});
      metrics.cls = 0;
      metrics.supported.push('layout-shift');
    } catch (_) {}
  }
})();
"""


def _number(value):
    """Return a finite nonnegative metric, excluding bool and missing values."""
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if math.isfinite(value) and value >= 0:
            return value
    return None


def _bytes(resource, key):
    value = resource.get(key, 0)
    number = _number(value)
    if number is None or number != int(number):
        raise ValueError(f"Resource {key} must be a nonnegative integer")
    return int(number)


def collect_performance(page, resources, limits, *, full=False):
    """Return LCP/CLS availability and decoded/transfer bytes from CDP events.

    A supported CLS observer with no shifts yields zero. Missing observers or
    missing samples yield None, so unavailable measurements cannot pass as zero.
    """
    warnings = []
    try:
        timing = page.evaluate("window.__shootPerformance")
    except Exception as error:
        timing = None
        warnings.append(f"Performance collection failed: {error}")
    if not isinstance(timing, dict):
        timing = {}
    supported = timing.get("supported")
    if not isinstance(supported, list):
        supported = []
    lcp = _number(timing.get("lcp")) if "largest-contentful-paint" in supported else None
    cls = _number(timing.get("cls")) if "layout-shift" in supported else None
    result = {
        "lcp": round(lcp) if lcp is not None else None,
        "cls": round(cls, 4) if cls is not None else None,
        "totalBytes": sum(_bytes(resource, "bytes") for resource in resources),
        "fontBytes": sum(_bytes(resource, "bytes") for resource in resources
                         if str(resource.get("type", "")).lower() == "font"),
        "transferBytes": sum(_bytes(resource, "transferBytes") for resource in resources),
        "resources": len(resources),
        "limits": dict(limits),
        "warnings": warnings,
        "scope": ("Loaded resources after full-page scroll" if full else
                  "Loaded resources only; lazy resources below the viewport may be excluded"),
        "measurement": ("Unthrottled lab sample; bytes are decoded response bodies measured "
                        "with CDP; transferBytes includes encoded bodies and protocol overhead. "
                        "This is not field data or a Core Web Vitals certification."),
    }
    for key, limit in limits.items():
        if result[key] is not None and result[key] > limit:
            warnings.append(f"{key}: {result[key]} > {limit}")
    if result["lcp"] is None:
        warnings.append("LCP unavailable; do not interpret as zero")
    if result["cls"] is None:
        warnings.append("CLS unavailable; do not interpret as zero")
    return result
