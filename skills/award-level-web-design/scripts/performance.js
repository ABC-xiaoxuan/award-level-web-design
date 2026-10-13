// Installed before navigation. LCP and layout shifts require PerformanceObserver.
(() => {
  const metrics = { lcp: null, cls: 0, supported: PerformanceObserver.supportedEntryTypes };
  let sessionStart = 0, lastShift = 0, sessionValue = 0;
  if (metrics.supported.includes('largest-contentful-paint')) {
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) metrics.lcp = entry.startTime;
    }).observe({type:'largest-contentful-paint', buffered:true});
  }
  if (metrics.supported.includes('layout-shift')) {
    new PerformanceObserver(list => {
      for (const e of list.getEntries()) {
        if (e.hadRecentInput) continue;
        if (!sessionStart || e.startTime-lastShift > 1000 || e.startTime-sessionStart > 5000) {
          sessionStart=e.startTime; sessionValue=0;
        }
        lastShift=e.startTime; sessionValue+=e.value;
        metrics.cls=Math.max(metrics.cls,sessionValue);
      }
    }).observe({type:'layout-shift',buffered:true});
  }
  window.__shootPerformance = metrics;
})();
