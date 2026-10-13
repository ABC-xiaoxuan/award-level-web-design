/* Shared progressive enhancement; works over file:// as well as GitHub Pages. */
(() => {
  const trigger = document.querySelector('.menu-toggle');
  const original = document.querySelector('.mobile-menu');
  if (!trigger || !original) return;
  const menu = document.createElement('dialog');
  menu.className = 'site-menu';
  menu.id = original.id;
  menu.setAttribute('aria-label', '页面导航');
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'menu-close';
  close.textContent = '关闭 ×';
  menu.append(close, ...original.childNodes);
  original.remove();
  document.body.append(menu);
  let overflow = '';
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.addEventListener('click', () => {
    overflow = document.documentElement.style.overflow;
    menu.showModal();
    document.documentElement.style.overflow = 'hidden';
    trigger.setAttribute('aria-expanded', 'true');
    close.focus();
  });
  close.addEventListener('click', () => menu.close());
  menu.addEventListener('close', () => {
    document.documentElement.style.overflow = overflow;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.focus({preventScroll: true});
  });
  menu.addEventListener('click', e => {
    const link = e.target.closest('a');
    if (!link) return;
    menu.close();
    if (link.hash && link.origin === location.origin && link.pathname === location.pathname) {
      const section = document.querySelector(link.hash);
      if (section) requestAnimationFrame(() => {
        section.setAttribute('tabindex', '-1');
        section.focus({preventScroll: true});
        section.scrollIntoView({block: 'start'});
        section.addEventListener('blur', () => section.removeAttribute('tabindex'), {once: true});
      });
    }
  });
  menu.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const items = [...menu.querySelectorAll('button,a[href]')];
    const first = items[0], last = items.at(-1);
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  const desktop = matchMedia('(min-width:1025px)');
  const closeOnDesktop = e => { if (e.matches && menu.open) menu.close(); };
  desktop.addEventListener?.('change', closeOnDesktop);
})();
