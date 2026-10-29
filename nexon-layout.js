// Based on the user's 넥슨 라이브 · 영상 크게 + 옆 채팅 1.0.0.
(() => {
  if (!globalThis.ChzzkLayout || globalThis.__chzzkNexonLayout) return;
  globalThis.__chzzkNexonLayout = true;
  ChzzkLayout.install({ feature: 'nexonWide', key: 'nexonWideLayout', legacy: () => Boolean(document.getElementById('nlf-style')), create });
  function create(initial, persist) {
    const root = document.documentElement, life = new AbortController(), signal = life.signal;
    let enabled = initial?.enabled !== false, preferredWidth = Number(initial?.width) || 360;
    if (!initial) try {
      enabled = localStorage.getItem('nlf.enabled') !== 'false';
      preferredWidth = Number(localStorage.getItem('nlf.width')) || 360;
    } catch { /* use defaults when page storage is unavailable */ }
    let player, side, panel, frame = 0, disposed = false;
    const tags = new Set(), expanded = new WeakMap();
    const style = document.createElement('style'); style.id = 'ctnlf-style';
    style.textContent = `
    html[data-ctnlf-active], html[data-ctnlf-active] body {overflow:hidden!important;background:#000!important}
    html[data-ctnlf-active] [class*="GlobalNavBar_root__"],
    html[data-ctnlf-active] [class*="GlobalFooter_root__"],
    html[data-ctnlf-active] [class*="Viewport_lnbInflow__"],
    html[data-ctnlf-active] [data-ctnlf-main] > :not([data-ctnlf-player]),
    html[data-ctnlf-active] [data-ctnlf-side] > :not([data-ctnlf-chat]) {display:none!important}
    html[data-ctnlf-active] [data-ctnlf-path] {transform:none!important;filter:none!important;perspective:none!important;contain:none!important;content-visibility:visible!important}
    html[data-ctnlf-active] [data-ctnlf-player] {
      display:block!important;position:fixed!important;inset:0 auto 0 0!important;
      width:calc(100vw - var(--ctnlf-chat-width) - 8px)!important;height:100vh!important;height:100dvh!important;
      min-width:0!important;max-width:none!important;min-height:0!important;max-height:none!important;
      padding:0!important;margin:0!important;flex:none!important;border:0!important;border-radius:0!important;
      background:#000!important;z-index:100000!important;
    }
    html[data-ctnlf-active] [data-ctnlf-player] [class*="AspectRatio_inner__"] {position:absolute!important;inset:0!important;width:100%!important;height:100%!important}
    html[data-ctnlf-active] [data-ctnlf-player] [class*="VideoOverlay_root__"] {border-radius:0!important;width:100%!important;height:100%!important}
    html[data-ctnlf-active] [data-ctnlf-player] :is([class*="Video_root__"],[class*="VideoControlsTrigger_root__"]) {width:100%!important;height:100%!important;min-height:0!important}
    html[data-ctnlf-active] [data-ctnlf-player] video {width:100%!important;height:100%!important;object-fit:contain!important}
    html[data-ctnlf-active] [data-ctnlf-side] {
      display:flex!important;position:fixed!important;inset:0 0 0 auto!important;
      flex-direction:column!important;width:var(--ctnlf-chat-width)!important;min-width:0!important;max-width:none!important;
      height:100vh!important;height:100dvh!important;min-height:0!important;max-height:none!important;
      padding:0!important;margin:0!important;overflow:hidden!important;visibility:visible!important;
      transform:none!important;transition:none!important;z-index:100001!important;
      background:var(--surface-primary,#fff)!important;
    }
    html[data-ctnlf-active] [data-ctnlf-chat] {
      display:flex!important;flex:1 1 0!important;flex-direction:column!important;
      width:100%!important;min-width:0!important;max-width:none!important;height:100%!important;
      min-height:0!important;max-height:none!important;margin:0!important;border:0!important;border-radius:0!important;
    }
    html[data-ctnlf-active] [data-ctnlf-chat] [class*="ChatPanel_header__"] {flex:0 0 56px!important;height:56px!important;padding-right:20px!important}
    html[data-ctnlf-active] [data-ctnlf-chat] [class*="ChatPanel_trigger__"],
    html[data-ctnlf-active] [data-ctnlf-chat] [class*="ChatPanel_expander__"] {display:none!important}
    html[data-ctnlf-active] [data-ctnlf-chat] [class*="ChatPanel_content__"] {display:block!important;flex:1 1 0!important;height:0!important;min-height:0!important;overflow:hidden!important}
    html[data-ctnlf-active] [data-ctnlf-chat] [class*="Chat_root__"] {height:100%!important;min-height:0!important}
    html[data-ctnlf-active] [data-ctnlf-chat] [class*="Chat_content__"] {flex:1 1 0!important;min-height:0!important}
    html[data-ctnlf-active] [data-ctnlf-chat] [class*="ChatContent_root__"] {min-height:0!important}
    #ctnlf-controls {position:fixed;top:12px;left:12px;z-index:2147483646;display:flex;gap:6px;opacity:.25;transition:opacity .15s;font:13px/1.4 sans-serif}
    #ctnlf-controls:hover,#ctnlf-controls:has(:focus-visible) {opacity:1}
    #ctnlf-controls button {appearance:none;border:1px solid #64748b;border-radius:7px;background:#18212fee;color:#fff;padding:7px 10px;cursor:pointer;font:inherit}
    #ctnlf-controls button:hover {background:#334155}
    #ctnlf-divider {display:none;position:fixed;top:0;bottom:0;right:var(--ctnlf-chat-width);width:8px;background:#242a34;z-index:100002;cursor:col-resize;touch-action:none;outline-offset:-2px}
    html[data-ctnlf-active] #ctnlf-divider {display:block}
    #ctnlf-divider:hover,#ctnlf-divider:focus-visible {background:#5c78ff}
    #ctnlf-divider::after {content:'';position:absolute;top:calc(50% - 24px);left:3px;width:2px;height:48px;background:#aab1c2;border-radius:2px}
    html[data-ctnlf-dragging] body {cursor:col-resize!important;user-select:none!important}
  `;
    document.head.append(style);
    const controls = document.createElement('div'); controls.id = 'ctnlf-controls';
    const toggleButton = document.createElement('button'); toggleButton.type = 'button'; toggleButton.title = '큰 화면 켜기/끄기 · Alt+Shift+M';
    const fullscreenButton = document.createElement('button'); fullscreenButton.type = 'button'; fullscreenButton.textContent = '화면 채우기';
    const status = document.createElement('span'); status.setAttribute('role', 'status');
    controls.append(toggleButton, fullscreenButton, status);
    const save = () => persist({ enabled, width: preferredWidth });
    const active = () => root.hasAttribute('data-ctnlf-active');
    const width = () => parseFloat(root.style.getPropertyValue('--ctnlf-chat-width')) || preferredWidth;
    function applyWidth(value, store = false) {
      const actual = Math.round(Math.max(1, Math.min(Math.max(1, innerWidth - 9), value)));
      root.style.setProperty('--ctnlf-chat-width', actual + 'px');
      divider.setAttribute('aria-valuemin', '1'); divider.setAttribute('aria-valuemax', String(Math.max(1, innerWidth - 9))); divider.setAttribute('aria-valuenow', String(actual));
      if (store) { preferredWidth = actual; save(); }
    }
    const divider = ChzzkLayout.divider({ id: 'ctnlf-divider', width, apply: applyWidth, active, signal });
    document.body.append(controls, divider);
    function mark(element, name) { if (element) { element.setAttribute('data-ctnlf-' + name, ''); tags.add(element); } }
    function clearTags() { for (const element of tags) for (const attr of [...element.attributes]) if (attr.name.startsWith('data-ctnlf-')) element.removeAttribute(attr.name); tags.clear(); }
    function refresh() {
      const on = Boolean(enabled && player?.isConnected && side?.isConnected && panel?.isConnected);
      root.toggleAttribute('data-ctnlf-active', on);
      controls.hidden = !player?.isConnected || !side?.isConnected || !panel?.isConnected;
      controls.style.display = controls.hidden ? 'none' : 'flex';
      toggleButton.textContent = on ? '원래 화면' : '크게 보기'; toggleButton.setAttribute('aria-pressed', String(on));
      fullscreenButton.hidden = !on; divider.tabIndex = on ? 0 : -1; divider.setAttribute('aria-hidden', String(!on)); applyWidth(preferredWidth);
      if (on && panel.getAttribute('data-state') === 'closed') {
        const count = expanded.get(panel) || 0;
        const button = panel.querySelector('button[aria-expanded="false"]');
        if (button && count < 2) { expanded.set(panel, count + 1); button.click(); }
      }
    }
    function sync() {
      frame = 0; if (disposed) return;
      const video = document.querySelector('main video');
      const candidate = video?.closest('[class*="AspectRatio_root__"],[class*="Content_inner__"]') || document.querySelector('main [class*="AspectRatio_root__"]');
      const main = candidate?.closest('[class*="Content_root__"]');
      const nativeSide = main?.parentElement?.querySelector(':scope > [class*="SideContent_root__"]');
      const candidatePanel = nativeSide?.querySelector('[class*="ChatPanel_root__"]') || [...document.querySelectorAll('[class*="ChatPanel_root__"]')].find(element => element.getClientRects().length);
      const candidateSide = nativeSide || candidatePanel?.closest('[class*="Chat_root__"]') || candidatePanel?.parentElement;
      if (candidate !== player || candidateSide !== side || candidatePanel !== panel) {
        clearTags(); player = candidate; side = candidateSide; panel = candidatePanel;
        mark(player, 'player'); mark(main, 'main'); mark(side, 'side'); mark(panel, 'chat');
        for (const start of [player?.parentElement, side?.parentElement]) for (let element = start; element && element !== root; element = element.parentElement) mark(element, 'path');
      }
      refresh();
    }
    function schedule() { if (!disposed && !frame) frame = requestAnimationFrame(sync); }
    const relevant = '[class*="AspectRatio_root__"],[class*="Content_inner__"],[class*="SideContent_root__"],[class*="ChatPanel_root__"],video';
    const observer = new MutationObserver(records => {
      if (player && (!player.isConnected || !side?.isConnected || !panel?.isConnected) || records.some(record => [...record.addedNodes].some(node => node.nodeType === 1 && (node.matches(relevant) || node.querySelector(relevant))))) schedule();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    function toggle() { enabled = !enabled; save(); refresh(); }
    async function fullscreen() {
      try { if (document.fullscreenElement) await document.exitFullscreen(); else await root.requestFullscreen(); status.textContent = ''; }
      catch { status.textContent = '전체화면 요청 실패 · F11을 사용해 주세요.'; }
    }
    toggleButton.addEventListener('click', toggle, { signal }); fullscreenButton.addEventListener('click', fullscreen, { signal });
    window.addEventListener('resize', () => applyWidth(preferredWidth), { signal }); window.addEventListener('popstate', schedule, { signal });
    sync();
    return { sync: schedule,
      keydown(event) {
        if (event.defaultPrevented || event.isComposing || ChzzkLayout.typing(event) || event.repeat) return;
        if (event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey && event.code === 'KeyM') { event.preventDefault(); toggle(); }
        else if (active() && event.code === 'KeyF' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) { event.preventDefault(); event.stopImmediatePropagation(); fullscreen(); }
      },
      click(event) {
        if (!active()) return;
        const button = event.target.closest?.('button[aria-label^="전체화면"]');
        if (button && player.contains(button)) { event.preventDefault(); event.stopImmediatePropagation(); fullscreen(); }
      },
      stop() { disposed = true; cancelAnimationFrame(frame); life.abort(); observer.disconnect(); clearTags(); root.removeAttribute('data-ctnlf-active'); root.removeAttribute('data-ctnlf-dragging'); root.style.removeProperty('--ctnlf-chat-width'); controls.remove(); divider.remove(); style.remove(); }
    };
  }
})();
