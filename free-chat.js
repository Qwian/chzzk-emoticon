// Adapted from the user's SOOP·치지직 자유 배치 채팅 1.4.0.
// Chat nodes and their editors stay in place; only layout CSS and tool controls are added.
(() => {
  if (window.top !== window || globalThis.__chzzkFreeChat) return;
  globalThis.__chzzkFreeChat = true;
  const isChzzk = location.hostname === 'chzzk.naver.com' || !!document.getElementById('aside-chatting');
  const storageKey = isChzzk ? 'chzzkFreeChatLayout' : 'soopFreeChatLayout';
  let controller = null, enabled = false, stopped = false, saved = null, lastSaved = '';
  function failure(error) {
    if (/extension context invalidated/i.test(error?.message || '')) stop();
  }
  function persist(value) {
    saved = value; lastSaved = JSON.stringify(value);
    try { chrome.storage.local.set({ [storageKey]: value }).catch(failure); } catch (error) { failure(error); }
  }
  function sync() {
    if (stopped) return;
    const legacy = Boolean(document.getElementById('sfc-style'));
    if (!enabled || legacy) { controller?.stop(); controller = null; }
    else if (!controller) controller = createController(saved, persist);
    if (legacy) document.documentElement.setAttribute('data-chzzk-free-chat', 'legacy-script');
    else document.documentElement.removeAttribute('data-chzzk-free-chat');
  }
  function onStorage(changes, area) {
    if (stopped || area !== 'local') return;
    if (changes.features) enabled = changes.features.newValue?.freeChat !== false;
    if (changes[storageKey] && JSON.stringify(changes[storageKey].newValue) !== lastSaved) {
      saved = changes[storageKey].newValue; lastSaved = JSON.stringify(saved);
      controller?.stop(); controller = null;
    }
    sync();
  }
  const legacyObserver = new MutationObserver(sync);
  function stop() {
    stopped = true; controller?.stop(); controller = null; legacyObserver.disconnect();
    try { chrome.storage.onChanged.removeListener(onStorage); } catch { /* invalidated */ }
    document.documentElement.removeAttribute('data-chzzk-free-chat');
  }
  try {
    chrome.storage.onChanged.addListener(onStorage);
    chrome.storage.local.get(['features', storageKey]).then(data => {
      if (stopped) return;
      enabled = data.features?.freeChat !== false; saved = data[storageKey]; lastSaved = JSON.stringify(saved);
      legacyObserver.observe(document.documentElement, { childList: true, subtree: true }); sync();
    }).catch(error => {
      failure(error);
      if (!stopped) { enabled = true; legacyObserver.observe(document.documentElement, { childList: true, subtree: true }); sync(); }
    });
  } catch (error) { failure(error); }
  function createController(initial, persist) {
  'use strict';
  const isChzzk = location.hostname === 'chzzk.naver.com' || !!document.getElementById('aside-chatting');
  const GAP = 0;
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const number = (value, fallback) => Number.isFinite(value) ? value : fallback;
  const defaults = { width: 340, height: 640, xRatio: 1, yRatio: 0, dockWidth: 392, opacity: 0.35, enabled: true };
  const geometryKeys = ['width', 'height', 'xRatio', 'yRatio'];
  const layoutKeys = [...geometryKeys, 'dockWidth'];
  const monitors = Object.create(null);
  function screenInfo() {
    const width = Math.max(1, number(window.screen?.width, window.innerWidth));
    const height = Math.max(1, number(window.screen?.height, window.innerHeight));
    const scale = number(window.devicePixelRatio, 1).toFixed(2);
    return { key: `${width}x${height}@${scale}`, width, height };
  }
  let currentMonitor = screenInfo();
  let savedMonitor = null;
  let settings = { ...defaults };
  try {
    const saved = initial;
    if (saved && typeof saved === 'object') {
      for (const key of [...layoutKeys, 'opacity']) {
        settings[key] = number(saved[key], defaults[key]);
      }
      settings.enabled = typeof saved.enabled === 'boolean' ? saved.enabled : true;
      if (saved.monitors && typeof saved.monitors === 'object') {
        for (const [key, profile] of Object.entries(saved.monitors)) {
          if (profile && geometryKeys.every(name => Number.isFinite(profile[name])) &&
              Number.isFinite(profile.screenWidth) && profile.screenWidth > 0 &&
              Number.isFinite(profile.screenHeight) && profile.screenHeight > 0) {
            monitors[key] = { width: clamp(profile.width, 240, 5000), height: clamp(profile.height, 180, 5000),
              xRatio: clamp(profile.xRatio, 0, 1), yRatio: clamp(profile.yRatio, 0, 1),
              dockWidth: clamp(number(profile.dockWidth, defaults.dockWidth), 240, 5000),
              screenWidth: profile.screenWidth, screenHeight: profile.screenHeight };
          }
        }
      }
      savedMonitor = typeof saved.lastMonitor === 'string' ? saved.lastMonitor : null;
    }
  } catch (_) { /* 저장소가 제한되어도 현재 페이지에서 사용 가능 */ }
  settings.width = clamp(settings.width, 240, 5000);
  settings.height = clamp(settings.height, 180, 5000);
  settings.xRatio = clamp(settings.xRatio, 0, 1);
  settings.yRatio = clamp(settings.yRatio, 0, 1);
  settings.opacity = clamp(settings.opacity, 0, 1);
  settings.dockWidth = clamp(settings.dockWidth, 240, 5000);
  if (monitors[currentMonitor.key]) {
    for (const key of layoutKeys) settings[key] = monitors[currentMonitor.key][key];
  } else if (savedMonitor && monitors[savedMonitor]) {
    const previous = monitors[savedMonitor];
    settings.width = clamp(previous.width * currentMonitor.width / previous.screenWidth, 240, 5000);
    settings.height = clamp(previous.height * currentMonitor.height / previous.screenHeight, 180, 5000);
    settings.dockWidth = clamp(previous.dockWidth * currentMonitor.width / previous.screenWidth, 240, 5000);
    settings.xRatio = previous.xRatio;
    settings.yRatio = previous.yRatio;
  }

  const style = document.createElement('style');
  style.id = 'ctfc-style';
  style.textContent = `
    .ctfc-toolbar, .ctfc-handle, .ctfc-dock-handle, #ctfc-toggle { display: none !important; }
    body.screen_mode #webplayer.ctfc-soop-docked,
    body.screen_mode #webplayer.ctfc-soop-docked #webplayer_contents {
      --modeChatWidth: var(--ctfc-dock-w) !important;
      --chatting_W: var(--ctfc-dock-w) !important;
    }
    body.screen_mode #webplayer.ctfc-soop-docked #webplayer_contents > .wrapping.side {
      width: var(--ctfc-dock-w) !important; flex: 0 0 var(--ctfc-dock-w) !important;
      min-width: 0 !important; max-width: none !important;
      --chatting_W: var(--ctfc-dock-w) !important;
    }
    body.screen_mode #webplayer.ctfc-soop-docked #player_area {
      width: calc(100% - var(--ctfc-dock-w)) !important; flex: 1 1 auto !important;
      min-width: 0 !important; max-width: none !important;
    }
    body.screen_mode #webplayer.ctfc-soop-docked #player_area .float_box,
    body.screen_mode #webplayer.ctfc-soop-docked #player {
      width: 100% !important; min-width: 0 !important; max-width: none !important;
    }
    body.screen_mode #webplayer.ctfc-soop-docked :is(.chatting_box,#chatting_area,#chatbox) {
      width: 100% !important; min-width: 0 !important; max-width: none !important;
    }
    body.screen_mode #webplayer.ctfc-soop-docked .ctfc-dock-handle {
      display: block !important; position: fixed !important;
      left: calc(100vw - var(--ctfc-dock-w) - 4px) !important;
      top: 0 !important; bottom: 0 !important; width: 8px !important;
      z-index: 2002 !important; cursor: ew-resize !important;
      touch-action: none; user-select: none; background: transparent;
    }
    .ctfc-dock-handle::after {
      content: ''; position: absolute; left: 3px; top: calc(50% - 20px);
      width: 2px; height: 40px; background: #a7adba; opacity: .5;
    }
    .ctfc-dock-handle:hover::after { opacity: 1; }
    body.screen_mode #webplayer.ctfc-enabled.chat_open { --modeChatWidth: 0px !important; }
    body.screen_mode #webplayer.ctfc-enabled.chat_open #player_area {
      width: 100% !important; max-width: none !important; flex: 1 1 100% !important;
    }
    body.screen_mode #webplayer.ctfc-enabled.chat_open #webplayer_contents > .wrapping.side {
      display: flex !important; flex-direction: column !important; gap: 0 !important;
      position: fixed !important; left: var(--ctfc-x) !important; top: var(--ctfc-y) !important;
      right: auto !important; bottom: auto !important;
      width: var(--ctfc-w) !important; height: var(--ctfc-h) !important;
      min-width: 0 !important; min-height: 0 !important; max-width: none !important; max-height: none !important;
      margin: 0 !important; padding: 0 !important; overflow: visible !important;
      z-index: 150 !important; background: transparent !important;
      box-shadow: 0 0 0 1px rgba(255,255,255,.18); border-radius: 0 !important;
    }
    body.screen_mode #webplayer.ctfc-enabled.chat_open .wrapping.side > :not(.chatting_box):not(.ctfc-toolbar):not(.ctfc-handle) {
      display: none !important;
    }
    body.screen_mode #webplayer.ctfc-enabled.chat_open .wrapping.side > .chatting_box {
      display: flex !important; flex: 1 1 0 !important; width: 100% !important;
      min-height: 0 !important; height: auto !important; margin: 0 !important; padding: 0 !important;
    }
    body.screen_mode #webplayer.ctfc-enabled.chat_open #chatting_area {
      width: 100% !important; height: 100% !important; max-height: none !important; min-height: 0 !important;
      border: 0 !important; border-radius: 0 !important;
      background: rgba(0,0,0,var(--ctfc-opacity)) !important;
    }
    body.screen_mode #webplayer.ctfc-enabled.chat_open #chatbox {
      width: 100% !important; height: 100% !important;
    }
    body.screen_mode #webplayer.ctfc-enabled.chat_open :is(#chatbox,#chat_area,.chatting-item-wrap,#actionbox) {
      background: transparent !important;
    }
    body.screen_mode #webplayer.ctfc-enabled.chat_open #actionbox::before { background: transparent !important; }
    body.screen_mode #webplayer.ctfc-enabled.chat_open #chatting_area :is(.message-text,.msg,.author,.area_header h2 span) {
      color: #f4f4f5 !important; text-shadow: 0 1px 3px #000 !important;
    }
    body.screen_mode #webplayer.ctfc-enabled.chat_open #chat_write { background: rgba(0,0,0,.45) !important; }
    body.screen_mode #webplayer.ctfc-enabled.chat_open #write_area { color: white !important; background: transparent !important; }
    .ctfc-chzzk-active .ctfc-chzzk-main {
      width: 100% !important; max-width: none !important; min-width: 0 !important; flex: 1 1 100% !important;
    }
    .ctfc-chzzk-active #aside-chatting {
      position: fixed !important; left: var(--ctfc-x) !important; top: var(--ctfc-y) !important;
      right: auto !important; bottom: auto !important;
      width: var(--ctfc-w) !important; height: var(--ctfc-h) !important;
      min-width: 0 !important; min-height: 0 !important; max-width: none !important; max-height: none !important;
      display: flex !important; flex-direction: column !important;
      margin: 0 !important; padding: 0 !important; overflow: visible !important;
      border: none !important; border-radius: 0 !important; z-index: 150 !important;
      background: rgba(0,0,0,var(--ctfc-opacity)) !important;
      box-shadow: 0 0 0 1px rgba(255,255,255,.18);
    }
    .ctfc-chzzk-active #aside-chatting > div:not(.ctfc-toolbar) { background: transparent !important; }
    .ctfc-chzzk-active #aside-chatting h2,
    .ctfc-chzzk-active #aside-chatting > div > [class*="_wrapper_"] > button,
    .ctfc-chzzk-active #aside-chatting [class*="_title_"] { color: #f4f4f5 !important; }
    .ctfc-chzzk-active #aside-chatting [role="log"] { min-height: 0 !important; }
    .ctfc-chzzk-active #aside-chatting [role="log"] [class*="_chatting_message_"] > span {
      color: #f4f4f5 !important; text-shadow: 0 1px 3px #000 !important;
    }
    .ctfc-chzzk-active #aside-chatting [contenteditable="true"] { color: white !important; }
    .ctfc-chzzk-active #aside-chatting [contenteditable="true"]::before { color: #c3c7d1 !important; }
    body.screen_mode #webplayer.ctfc-enabled.chat_open .ctfc-toolbar, .ctfc-chzzk-active .ctfc-toolbar {
      display: flex !important; position: relative !important; flex: 0 0 34px !important; z-index: 2000 !important;
      align-items: center !important; gap: 6px !important; padding: 0 8px !important;
      height: 34px !important; min-height: 34px !important; width: 100% !important;
      box-sizing: border-box !important; border-radius: 0 !important;
      background: rgba(18,20,25,max(.8,var(--ctfc-opacity))) !important; color: white !important;
      font: 12px/1.3 sans-serif !important; touch-action: none; user-select: none;
    }
    .ctfc-toolbar .ctfc-grip {
      display: flex; align-items: center; flex: 1; align-self: stretch; min-width: 0;
      cursor: move; color: #f4f4f5; font: 12px/1.3 sans-serif;
    }
    .ctfc-toolbar button {
      display: inline-block; padding: 4px 6px; background: #30333b; color: #fff;
      border: 1px solid #515563; border-radius: 5px; font: 11px/1.3 sans-serif;
      cursor: pointer; width: auto; height: auto;
    }
    .ctfc-toolbar button:focus-visible, #ctfc-toggle:focus-visible { outline: 2px solid #8bc5ff; outline-offset: 2px; }
    .ctfc-toolbar .ctfc-settings {
      position: absolute; z-index: 200; top: 38px; right: 6px; width: 220px;
      box-sizing: border-box; padding: 12px; background: #20232b; color: white;
      border: 1px solid #525866; border-radius: 8px; box-shadow: 0 4px 20px #0008;
      font: 12px/1.5 sans-serif;
    }
    .ctfc-settings[hidden] { display: none !important; }
    .ctfc-settings label { display: flex; gap: 8px; align-items: center; color: #fff; }
    .ctfc-settings input { display: block; width: 100%; margin-top: 10px; accent-color: #80bfff; cursor: pointer; }
    .ctfc-settings small { display: block; color: #c3c7d1; margin-top: 8px; }
    body.screen_mode #webplayer.ctfc-enabled.chat_open .ctfc-handle, .ctfc-chzzk-active .ctfc-handle {
      display: block !important; position: absolute !important; z-index: 2001 !important;
      touch-action: none; user-select: none; background: transparent;
    }
    .ctfc-handle[data-edge="n"] { top: -4px; left: 12px; right: 12px; height: 8px; cursor: ns-resize; }
    .ctfc-handle[data-edge="s"] { bottom: -4px; left: 12px; right: 12px; height: 8px; cursor: ns-resize; }
    .ctfc-handle[data-edge="w"] { left: -4px; top: 12px; bottom: 12px; width: 8px; cursor: ew-resize; }
    .ctfc-handle[data-edge="e"] { right: -4px; top: 12px; bottom: 12px; width: 8px; cursor: ew-resize; }
    .ctfc-handle[data-edge="nw"],.ctfc-handle[data-edge="ne"],.ctfc-handle[data-edge="sw"],.ctfc-handle[data-edge="se"] { width: 14px; height: 14px; }
    .ctfc-handle[data-edge="nw"] { top: -4px; left: -4px; cursor: nwse-resize; }
    .ctfc-handle[data-edge="ne"] { top: -4px; right: -4px; cursor: nesw-resize; }
    .ctfc-handle[data-edge="sw"] { bottom: -4px; left: -4px; cursor: nesw-resize; }
    .ctfc-handle[data-edge="se"] { bottom: -4px; right: -4px; cursor: nwse-resize; }
    #webplayer.ctfc-controls-inset #player .player_ctrlBox {
      left: var(--ctfc-controls-left) !important; right: var(--ctfc-controls-right) !important;
      width: auto !important; min-width: 0 !important; box-sizing: border-box !important;
      transition-property: bottom, opacity !important;
    }
    .ctfc-chzzk-active.ctfc-controls-inset #live_player_layout .pzp-pc__bottom {
      left: calc(18px + var(--ctfc-controls-left)) !important;
      right: calc(18px + var(--ctfc-controls-right)) !important;
      width: auto !important; min-width: 0 !important; box-sizing: border-box !important;
      transition-property: bottom, opacity !important;
    }
    body.screen_mode #webplayer #ctfc-toggle, .ctfc-chzzk-wide #ctfc-toggle {
      display: block !important; position: fixed; left: calc(12px + var(--ctfc-controls-left, 0px)); bottom: 72px; z-index: 151;
      padding: 6px 9px; width: auto; height: auto; border: 1px solid #737985;
      border-radius: 7px; background: #1c202bdd; color: white; font: 11px/1.3 sans-serif;
      cursor: pointer; opacity: .35; transition: opacity .15s;
    }
    body.screen_mode #webplayer #ctfc-toggle:hover, body.screen_mode #webplayer #ctfc-toggle:focus-visible,
    .ctfc-chzzk-wide #ctfc-toggle:hover, .ctfc-chzzk-wide #ctfc-toggle:focus-visible { opacity: 1; }
  `;
  document.head.append(style);
  let mount = null;
  let disposed = false;
  const lifetime = new AbortController();
  let frame = 0;
  let gesture = null;

  function save() {
    monitors[currentMonitor.key] = profile();
    const saved = { ...settings, lastMonitor: currentMonitor.key, monitors: { ...monitors } };
    try {
      persist(saved);
    } catch (_) { /* 저장 실패가 채팅 사용을 막지 않음 */ }
  }

  function profile() {
    const value = { screenWidth: currentMonitor.width, screenHeight: currentMonitor.height };
    for (const key of layoutKeys) value[key] = settings[key];
    return value;
  }

  function syncMonitor() {
    const next = screenInfo();
    if (next.key === currentMonitor.key) return false;
    monitors[currentMonitor.key] = profile();
    const existing = monitors[next.key];
    if (existing) {
      for (const key of layoutKeys) settings[key] = existing[key];
    } else {
      settings.width = clamp(settings.width * next.width / currentMonitor.width, 240, 5000);
      settings.height = clamp(settings.height * next.height / currentMonitor.height, 180, 5000);
      settings.dockWidth = clamp(settings.dockWidth * next.width / currentMonitor.width, 240, 5000);
    }
    currentMonitor = next;
    save();
    return true;
  }

  function limits() {
    const width = Math.max(1, window.innerWidth - GAP * 2);
    const height = Math.max(1, window.innerHeight - GAP * 2);
    return { width, height, minWidth: Math.min(240, width), minHeight: Math.min(180, height) };
  }

  function savedRect() {
    const size = limits();
    const w = clamp(settings.width, size.minWidth, size.width);
    const h = clamp(settings.height, size.minHeight, size.height);
    return { x: GAP + (size.width - w) * settings.xRatio, y: GAP + (size.height - h) * settings.yRatio, w, h };
  }

  function applyRect(rect) {
    if (!mount) return;
    for (const [name, value] of Object.entries(rect)) mount.side.style.setProperty(`--ctfc-${name}`, `${value}px`);
    updateControls(rect);
  }

  function updateControls(rect) {
    if (!mount) return;
    let left = 0, right = 0;
    const active = settings.enabled && (isChzzk
      ? mount.player.classList.contains('ctfc-chzzk-active')
      : document.body.classList.contains('screen_mode') && mount.player.classList.contains('chat_open'));
    const video = mount.player.querySelector(isChzzk ? '#live_player_layout' : '#player');
    if (active && rect && video) {
      const bounds = video.getBoundingClientRect();
      if (bounds.width > 0 && rect.y + rect.h > bounds.bottom - 64 && rect.y < bounds.bottom) {
        if (rect.x <= bounds.left + 1 && rect.x + rect.w < bounds.right - 1) {
          left = clamp(rect.x + rect.w - bounds.left, 0, bounds.width);
        } else if (rect.x + rect.w >= bounds.right - 1 && rect.x > bounds.left + 1) {
          right = clamp(bounds.right - rect.x, 0, bounds.width);
        }
      }
    }
    mount.player.style.setProperty('--ctfc-controls-left', `${left}px`);
    mount.player.style.setProperty('--ctfc-controls-right', `${right}px`);
    mount.player.classList.toggle('ctfc-controls-inset', left > 0 || right > 0);
  }

  function dockLimits() {
    const maxWidth = Math.max(1, window.innerWidth - 500);
    return { minWidth: Math.min(240, maxWidth), maxWidth };
  }

  function applyDockWidth(width) {
    if (!mount || isChzzk) return;
    const limit = dockLimits();
    mount.player.style.setProperty('--ctfc-dock-w', `${clamp(width, limit.minWidth, limit.maxWidth)}px`);
  }

  function rememberRect(rect, edge) {
    const size = limits();
    if (edge !== 'move' && (edge.includes('w') || edge.includes('e'))) settings.width = rect.w;
    if (edge !== 'move' && (edge.includes('n') || edge.includes('s'))) settings.height = rect.h;
    if (size.width > rect.w) settings.xRatio = clamp((rect.x - GAP) / (size.width - rect.w), 0, 1);
    if (size.height > rect.h) settings.yRatio = clamp((rect.y - GAP) / (size.height - rect.h), 0, 1);
    save();
  }

  function render() {
    frame = 0;
    if (!mount?.side.isConnected || !mount?.player.isConnected || (isChzzk && !mount?.videoMain.isConnected)) { install(); return; }
    syncMonitor();
    const wide = isChzzk ? /(?:^|\s)_is_large_/.test(mount.videoMain.className) : document.body.classList.contains('screen_mode');
    const chatOpen = isChzzk ? !/(?:^|\s)_is_folded_/.test(mount.side.className) : mount.player.classList.contains('chat_open');
    const active = settings.enabled && wide && chatOpen;
    mount.player.classList.toggle('ctfc-enabled', settings.enabled);
    if (isChzzk) {
      mount.player.classList.toggle('ctfc-chzzk-wide', wide);
      mount.player.classList.toggle('ctfc-chzzk-active', active);
    } else {
      mount.player.classList.toggle('ctfc-soop-docked', !settings.enabled && wide && chatOpen);
      if (gesture?.edge !== 'dock') applyDockWidth(settings.dockWidth);
    }
    mount.toggle.textContent = settings.enabled ? '채팅 겹치기 켬' : '채팅 겹치기 끔';
    mount.toggle.setAttribute('aria-pressed', String(settings.enabled));
    mount.side.style.setProperty('--ctfc-opacity', settings.opacity.toFixed(2));
    mount.alpha.value = String(Math.round(settings.opacity * 100));
    mount.output.textContent = `${Math.round(settings.opacity * 100)}%`;
    if (!active) { hidePanel(); updateControls(null); }
    if (!gesture) applyRect(savedRect());
  }

  function schedule() {
    if (!disposed && !frame) frame = requestAnimationFrame(render);
  }

  function hidePanel() {
    if (!mount) return;
    mount.panel.hidden = true;
    mount.toolbar.querySelector('.ctfc-opacity').setAttribute('aria-expanded', 'false');
  }

  function pointerDown(event, edge) {
    if (event.button !== 0 || !mount) return;
    if (syncMonitor()) render();
    const active = edge === 'dock'
      ? !isChzzk && mount.player.classList.contains('ctfc-soop-docked')
      : settings.enabled && (isChzzk ? mount.player.classList.contains('ctfc-chzzk-active') : document.body.classList.contains('screen_mode') && mount.player.classList.contains('chat_open'));
    if (!active) return;
    if (gesture) return;
    event.preventDefault();
    event.stopPropagation();
    hidePanel();
    const box = mount.side.getBoundingClientRect();
    gesture = { id: event.pointerId, target: event.currentTarget, edge, startX: event.clientX, startY: event.clientY,
      original: { x: box.x, y: box.y, w: box.width, h: box.height }, current: { x: box.x, y: box.y, w: box.width, h: box.height } };
    gesture.target.setPointerCapture(event.pointerId);
  }

  function pointerMove(event) {
    if (!gesture || event.pointerId !== gesture.id) return;
    const g = gesture;
    const dx = event.clientX - g.startX, dy = event.clientY - g.startY;
    const size = limits();
    const old = g.original;
    let { x, y, w, h } = old;
    if (g.edge === 'dock') {
      const limit = dockLimits();
      w = clamp(old.w - dx, limit.minWidth, limit.maxWidth);
      g.current = { x: window.innerWidth - w, y, w, h };
      applyDockWidth(w);
      return;
    } else if (g.edge === 'move') {
      x = clamp(old.x + dx, GAP, window.innerWidth - GAP - w);
      y = clamp(old.y + dy, GAP, window.innerHeight - GAP - h);
    } else {
      if (g.edge.includes('e')) w = clamp(old.w + dx, size.minWidth, window.innerWidth - GAP - x);
      if (g.edge.includes('s')) h = clamp(old.h + dy, size.minHeight, window.innerHeight - GAP - y);
      if (g.edge.includes('w')) {
        x = clamp(old.x + dx, GAP, old.x + old.w - size.minWidth);
        w = old.x + old.w - x;
      }
      if (g.edge.includes('n')) {
        y = clamp(old.y + dy, GAP, old.y + old.h - size.minHeight);
        h = old.y + old.h - y;
      }
    }
    g.current = { x, y, w, h };
    applyRect(g.current);
  }

  function pointerEnd(event) {
    if (!gesture || event.pointerId !== gesture.id) return;
    const finished = gesture;
    gesture = null;
    if (Object.keys(finished.current).some(key => Math.abs(finished.current[key] - finished.original[key]) > 0.01)) {
      if (finished.edge === 'dock') {
        settings.dockWidth = finished.current.w;
        save();
      } else {
        rememberRect(finished.current, finished.edge);
      }
    }
    if (finished.target.hasPointerCapture(finished.id)) finished.target.releasePointerCapture(finished.id);
    schedule();
  }

  function install() {
    const side = isChzzk ? document.getElementById('aside-chatting') : document.querySelector('#webplayer_contents > .wrapping.side');
    const player = isChzzk ? side?.closest('section') : document.getElementById('webplayer');
    const videoMain = isChzzk ? side?.parentElement.querySelector(':scope > main') : null;
    if (!player || !side || (isChzzk ? !videoMain : !side.querySelector('#chatting_area'))) return;
    if (mount?.side === side && mount.player === player && mount.videoMain === videoMain && mount.toolbar.isConnected) return;
    teardownMount();
    if (isChzzk) videoMain.classList.add('ctfc-chzzk-main');
    gesture = null;
    const abort = new AbortController();
    const on = (element, type, callback) => element.addEventListener(type, callback, { signal: abort.signal });
    const toolbar = document.createElement('div');
    toolbar.className = 'ctfc-toolbar';
    toolbar.innerHTML = '<div class="ctfc-grip" title="잡아서 위치 이동">⠿ 채팅 이동</div>' +
      '<button type="button" class="ctfc-opacity" aria-expanded="false">투명도</button>' +
      '<button type="button" class="ctfc-disable" title="기존 오른쪽 배치로 돌아가기">원래 배치</button>' +
      '<div class="ctfc-settings" hidden><label for="ctfc-alpha">배경 농도 <output id="ctfc-alpha-value"></output></label>' +
      '<input id="ctfc-alpha" type="range" min="0" max="100" step="5" aria-label="채팅 배경 농도">' +
      '<small>0%: 투명 · 100%: 불투명<br>위치·크기는 모니터별로 저장돼요.</small></div>';
    const toggle = document.createElement('button');
    toggle.id = 'ctfc-toggle';
    toggle.type = 'button';
    toggle.title = '채팅 겹치기 켜기/끄기 · Alt+Shift+C';
    player.append(toggle);
    let dockHandle = null;
    if (!isChzzk) {
      dockHandle = document.createElement('div');
      dockHandle.className = 'ctfc-dock-handle';
      dockHandle.title = '좌우로 드래그해서 채팅창 폭 조절';
      dockHandle.setAttribute('aria-hidden', 'true');
      player.append(dockHandle);
      on(dockHandle, 'pointerdown', event => pointerDown(event, 'dock'));
    }
    side.prepend(toolbar);
    const panel = toolbar.querySelector('.ctfc-settings');
    const alpha = toolbar.querySelector('input');
    const output = toolbar.querySelector('output');
    const opacityButton = toolbar.querySelector('.ctfc-opacity');
    const handles = [];
    const observer = new MutationObserver(schedule);
    observer.observe(player, { attributes: true, attributeFilter: ['class'] });
    if (isChzzk) {
      observer.observe(side, { attributes: true, attributeFilter: ['class'] });
      observer.observe(videoMain, { attributes: true, attributeFilter: ['class'] });
    }
    mount = { player, side, videoMain, toolbar, toggle, dockHandle, panel, alpha, output, handles, abort, observer };
    on(toolbar.querySelector('.ctfc-grip'), 'pointerdown', event => pointerDown(event, 'move'));
    on(opacityButton, 'click', event => {
      event.stopPropagation();
      panel.hidden = !panel.hidden;
      opacityButton.setAttribute('aria-expanded', String(!panel.hidden));
    });
    on(alpha, 'input', () => {
      settings.opacity = clamp(Number(alpha.value) / 100, 0, 1);
      render();
    });
    on(alpha, 'change', save);
    const toggleMode = () => { settings.enabled = !settings.enabled; save(); schedule(); };
    on(toggle, 'click', toggleMode);
    on(toolbar.querySelector('.ctfc-disable'), 'click', toggleMode);
    on(panel, 'pointerdown', event => event.stopPropagation());
    for (const edge of ['n', 's', 'w', 'e', 'nw', 'ne', 'sw', 'se']) {
      const handle = document.createElement('div');
      handle.className = 'ctfc-handle';
      handle.dataset.edge = edge;
      handle.title = '잡아서 크기 조절';
      handle.setAttribute('aria-hidden', 'true');
      side.append(handle);
      handles.push(handle);
      on(handle, 'pointerdown', event => pointerDown(event, edge));
    }
    for (const element of [toolbar.querySelector('.ctfc-grip'), ...handles, ...(dockHandle ? [dockHandle] : [])]) {
      on(element, 'pointermove', pointerMove);
      on(element, 'pointerup', pointerEnd);
      on(element, 'pointercancel', pointerEnd);
      on(element, 'lostpointercapture', pointerEnd);
    }
    render();
  }

  function teardownMount() {
    if (!mount) return;
    mount.abort.abort(); mount.observer.disconnect();
    if (gesture?.target.hasPointerCapture(gesture.id)) gesture.target.releasePointerCapture(gesture.id);
    gesture = null;
    mount.toolbar.remove(); mount.toggle.remove(); mount.dockHandle?.remove();
    mount.handles.forEach(handle => handle.remove());
    mount.player.classList.remove('ctfc-enabled', 'ctfc-soop-docked', 'ctfc-controls-inset', 'ctfc-chzzk-wide', 'ctfc-chzzk-active');
    mount.videoMain?.classList.remove('ctfc-chzzk-main');
    for (const element of [mount.side, mount.player]) for (const name of ['x', 'y', 'w', 'h', 'opacity', 'dock-w', 'controls-left', 'controls-right']) element.style.removeProperty(`--ctfc-${name}`);
    mount = null;
  }
  const listen = (target, type, callback) => target.addEventListener(type, callback, { signal: lifetime.signal });
  listen(window, 'resize', () => {
    if (gesture) {
      const old = gesture;
      gesture = null;
      if (old.target.hasPointerCapture(old.id)) old.target.releasePointerCapture(old.id);
    }
    schedule();
  });
  listen(window, 'focus', schedule);
  listen(document, 'visibilitychange', () => { if (!document.hidden) schedule(); });
  listen(document, 'keydown', event => {
    if (event.key === 'Escape' && mount && !mount.panel.hidden) {
      hidePanel();
    }
    if (!event.defaultPrevented && !event.repeat && !event.isComposing && event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey && event.code === 'KeyC' && mount) {
      event.preventDefault();
      settings.enabled = !settings.enabled;
      save();
      schedule();
    }
  });
  listen(document, 'pointerdown', event => {
    if (mount && !mount.toolbar.contains(event.target)) {
      hidePanel();
    }
  });
  const treeObserver = new MutationObserver(() => {
    if (!mount?.side.isConnected || !mount?.toolbar.isConnected || !mount?.player.isConnected || (isChzzk && !mount?.videoMain.isConnected)) install();
  });
  treeObserver.observe(document.body, { childList: true, subtree: true });
  const modeObserver = new MutationObserver(schedule);
  modeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  install();

  return { stop() { disposed = true; cancelAnimationFrame(frame); lifetime.abort(); treeObserver.disconnect(); modeObserver.disconnect(); teardownMount(); style.remove(); } };
  }
})();
