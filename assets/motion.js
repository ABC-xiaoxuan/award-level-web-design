/* Pausable animation clock: no active timers while hidden, hovered or focused. */
window.createMotion = (root, button, tick, options = {}) => {
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const interactionRoot = options.interactionRoot || root;
  let manual = preference.matches, hover = false, focus = false, visible = true;
  let frame = 0, last = 0;
  const blocked = () => manual || hover || focus || !visible || document.hidden;
  function loop(now) {
    frame = 0;
    if (blocked()) return;
    tick(last ? Math.min(now - last, 100) : 0);
    last = now;
    frame = requestAnimationFrame(loop);
  }
  function sync() {
    cancelAnimationFrame(frame); frame = 0; last = 0;
    root.dataset.motionPaused = String(blocked());
    if (button) {
      button.textContent = manual ? (options.play || '播放演示') : (options.pause || '暂停演示');
      button.setAttribute('aria-pressed', String(manual));
    }
    if (!blocked()) frame = requestAnimationFrame(loop);
  }
  button?.addEventListener('click', () => { manual = !manual; sync(); });
  interactionRoot.addEventListener('pointerenter', e => { if (e.pointerType !== 'touch') { hover = true; sync(); } });
  interactionRoot.addEventListener('pointerleave', () => { hover = false; sync(); });
  interactionRoot.addEventListener('focusin', () => { focus = true; sync(); });
  interactionRoot.addEventListener('focusout', e => { if (!interactionRoot.contains(e.relatedTarget)) { focus = false; sync(); } });
  document.addEventListener('visibilitychange', sync);
  preference.addEventListener('change', e => { manual = e.matches; sync(); });
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); }).observe(root);
  sync();
  return { pause() { manual = true; sync(); }, sync };
};
