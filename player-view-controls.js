(() => {
  if (globalThis.ChzzkViewControls) return;
  const style = document.createElement('style');
  style.id = 'ct-view-controls-style';
  style.textContent = `
    .ct-view-controls{display:inline-flex;align-items:center;height:100%;vertical-align:middle;gap:0;flex:none}
    .ct-view-control{display:inline-flex!important;align-items:center;justify-content:center;position:relative!important;
      inset:auto!important;flex:none;width:auto!important;height:100%!important;margin:0!important;padding:8px!important;
      border:0!important;border-radius:0!important;background:transparent!important;color:#fff!important;
      font:600 12px/1.3 system-ui!important;white-space:nowrap;cursor:pointer;opacity:.7}
    .ct-view-control:hover,.ct-view-control:focus-visible,.ct-view-control[aria-pressed=true]{opacity:1}
    .ct-view-control:focus-visible{outline:2px solid #80ffd5;outline-offset:-2px}
    .ct-view-control[hidden],.pzp-pc:not(.pzp-pc--controls) .ct-view-controls{visibility:hidden!important;pointer-events:none!important}
    .ct-view-control[hidden]{display:none!important}
  `;
  (document.head || document.documentElement).append(style);
  function bar(context) {
    const fs = document.fullscreenElement;
    if (fs?.matches('video,iframe')) return null;
    const root = context?.matches?.('video') ? context.closest('.pzp,#webplayer,#movie_player') || context.parentElement : context;
    const bottom = root?.querySelector('.pzp-pc__bottom,.player_ctrlBox,.ytp-chrome-bottom');
    if (!bottom || fs && !fs.contains(bottom)) return null;
    const anchor = bottom.querySelector('#chzzk-player-tools,.custom__clip-button,button[aria-label="클립 만들기"]') ||
      bottom.querySelector('.pzp-pc__viewmode-button,.pzp-pc__fullscreen-button,.ytp-settings-button,.btn_screen_mode');
    return { bottom, parent: anchor?.parentElement || bottom.querySelector('.pzp-pc__bottom-buttons-right,.ytp-right-controls') || bottom, anchor };
  }
  function release(element) {
    if (!element) return;
    const slot = element.parentElement;
    element.remove();
    if (slot?.classList.contains('ct-view-controls') && !slot.children.length) slot.remove();
  }
  function place(element, context, first = false) {
    const found = bar(context);
    if (!found) { release(element); return null; }
    let slot = [...found.parent.children].find(node => node.classList.contains('ct-view-controls'));
    if (!slot) {
      slot = document.createElement('span'); slot.className = 'ct-view-controls';
      if (found.anchor) found.anchor.before(slot); else found.parent.append(slot);
    }
    if (element.parentElement !== slot) { release(element); if (first) slot.prepend(element); else slot.append(element); }
    return found.bottom;
  }
  function visible(element) {
    if (!element?.isConnected || element.closest('.pzp-pc:not(.pzp-pc--controls)')) return false;
    const r = element.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    for (let node = element; node; node = node.parentElement) {
      const s = getComputedStyle(node);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0 || node.hidden) return false;
    }
    return true;
  }
  // Capture sees clicks even when a site stops bubbling. Dismissal must never
  // consume the original click; Shadow DOM panels and separate launchers count
  // as inside through composedPath(). Return cleanup for feature teardown.
  function dismissOutside({ isOpen, elements, close, isInside = () => false }) {
    const onClick = event => {
      if (!isOpen()) return;
      const path = event.composedPath();
      if (elements().some(element => element && path.includes(element)) || isInside(event)) return;
      close();
    };
    window.addEventListener('click', onClick, true);
    return () => window.removeEventListener('click', onClick, true);
  }
  globalThis.ChzzkViewControls = Object.freeze({ place, release, visible, dismissOutside });
})();
