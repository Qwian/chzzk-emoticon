(() => {
  if (globalThis.__chzzkPlayerShortcuts) return;
  globalThis.__chzzkPlayerShortcuts = true;
  const lifetime = new AbortController(), pending = new Map(), timers = new Set();
  let enabled = true, stopped = false, ownedSpace = false;
  const spaceStatus = { down: 0, up: 0, last: 'waiting' };
  const editable = event => event.composedPath().some(node => node.isContentEditable ||
    node.matches?.("input,textarea,select,[contenteditable]:not([contenteditable='false']),[role='textbox']"));
  const modified = event => event.ctrlKey || event.altKey || event.metaKey || event.shiftKey;
  function clear() {
    pending.clear(); ownedSpace = false; timers.forEach(clearTimeout); timers.clear();
  }
  function stop() {
    if (stopped) return;
    stopped = true; clear(); lifetime.abort();
    try { chrome.storage.onChanged.removeListener(settingsChanged); } catch { /* extension reloaded */ }
  }
  function connected() {
    try { if (!stopped && chrome.runtime.id) return true; } catch { /* extension reloaded */ }
    stop(); return false;
  }
  function control(root, action) {
    const selector = root.id === 'webplayer'
      ? action === 'mute' ? '.volume .sound' : '#time_shift_play,#play'
      : action === 'mute' ? '.pzp-volume-button,button.pzp-pc__volume-button'
        : '.pzp-playback-switch,button.pzp-pc__playback-switch';
    return [...root.querySelectorAll(selector)].find(button => button.getBoundingClientRect().width > 0 &&
      !button.matches(':disabled,[aria-disabled="true"]') && !button.closest('[hidden],[inert]'));
  }
  function inspect(action) {
    const videos = [...document.querySelectorAll('.pzp video,#webplayer video')].filter(video =>
      video.isConnected && video.readyState > 0 && !video.closest('#midAdPlayerWrapper,#preAdPlayerWrapper,.webplayer-internal-core-ad-ui,#chzzk-sidebar-preview,#cheese-follow-preview') &&
      video.getBoundingClientRect().width > 16 && video.getBoundingClientRect().height > 16);
    videos.sort((a, b) => {
      const area = video => { const rect = video.getBoundingClientRect(); return rect.width * rect.height; };
      return area(b) - area(a);
    });
    const video = videos[0], root = video?.closest('.pzp,#webplayer');
    if (!root) return { reason: 'no-video' };
    if (!control(root, action)) return { reason: 'no-control' };
    // Native ad and modal controls keep ownership of their shortcuts.
    if ([...root.querySelectorAll('#midAdVideoContainer video,#preAdVideoContainer video,.webplayer-internal-core-ad-ui video')]
      .some(ad => !ad.ended && ad.getBoundingClientRect().width > 0)) return { reason: 'ad' };
    if (document.querySelector('dialog[open],[role="dialog"][aria-modal="true"]')) return { reason: 'modal' };
    return { reason: 'ready', state: { video, root, action, paused: video.paused, muted: video.muted, volume: video.volume, url: location.href } };
  }
  const candidate = action => inspect(action).state;
  globalThis.__chzzkPlayerShortcutStatus = () => ({ version: '0.10.9', enabled: enabled && !stopped,
    current: inspect('play').reason, ...spaceStatus });
  function unchanged(state) {
    return state.action === 'mute' ? state.video.muted === state.muted && state.video.volume === state.volume
      : state.video.paused === state.paused;
  }
  function onKeydown(event) {
    const space = event.code === 'Space';
    if (space) spaceStatus.down++;
    if (!enabled || !connected()) { if (space) spaceStatus.last = 'disabled'; return; }
    if (modified(event)) { if (space) spaceStatus.last = 'modifier'; return; }
    if (event.code === 'F11') {
      // SOOP cancels every key on its video/control surface. Keep the browser default,
      // including when chat has focus; requestFullscreen() would be a different mode.
      event.stopImmediatePropagation(); return;
    }
    const action = event.code === 'KeyM' ? 'mute' : event.code === 'Space' || event.code === 'KeyK' && !document.querySelector('#webplayer') ? 'play' : null;
    if (!action) return;
    if (editable(event)) { if (space) spaceStatus.last = 'editable'; return; }
    if (event.composedPath().some(node => node.matches?.('button,a,[role="button"]'))) {
      if (space) spaceStatus.last = 'button'; return;
    }
    if (space && ownedSpace) {
      if (event.repeat) { event.preventDefault(); event.stopImmediatePropagation(); return; }
      ownedSpace = false;
    }
    if (event.repeat || pending.has(event.code)) return;
    const inspected = inspect(action), state = inspected.state;
    if (space) spaceStatus.last = inspected.reason;
    if (state) {
      if (space && state.root.id !== 'webplayer') {
        // Own CHZZK Space on keydown. A missing/blocked keyup must not prevent it.
        ownedSpace = true; event.preventDefault(); event.stopImmediatePropagation();
        control(state.root, action).click();
        spaceStatus.last = unchanged(state) ? 'button-sent' : 'changed';
        const press = spaceStatus.down;
        const timer = setTimeout(() => {
          timers.delete(timer);
          if (spaceStatus.down === press) spaceStatus.last = unchanged(state) ? 'unchanged' : 'changed';
        }, 50);
        timers.add(timer);
        return;
      }
      pending.set(event.code, state);
      if (event.code === 'Space') event.preventDefault();
    }
  }
  function onKeyup(event) {
    if (event.code === 'Space') {
      spaceStatus.up++;
      if (ownedSpace) {
        ownedSpace = false;
        if (!modified(event) && !editable(event)) { event.preventDefault(); event.stopImmediatePropagation(); }
        return;
      }
    }
    if (!enabled || !connected()) return;
    if (event.code === 'F11' && !modified(event)) { event.stopImmediatePropagation(); return; }
    const state = pending.get(event.code); pending.delete(event.code);
    if (!state || modified(event) || editable(event)) return;
    // CHZZK acts on keydown, SOOP on keyup. Wait for both and the button default
    // action before falling back, so a working native shortcut is never toggled twice.
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (!enabled || !connected() || location.href !== state.url || !state.video.isConnected ||
          candidate(state.action)?.video !== state.video || !unchanged(state)) return;
      control(state.root, state.action)?.click();
    }, 0);
    timers.add(timer);
  }
  function settingsChanged(changes, area) {
    if (area !== 'local' || !changes.features) return;
    enabled = changes.features.newValue?.playerShortcuts !== false; clear();
  }
  if (!connected()) return;
  window.addEventListener('keydown', onKeydown, { capture: true, signal: lifetime.signal });
  window.addEventListener('keyup', onKeyup, { capture: true, signal: lifetime.signal });
  window.addEventListener('blur', clear, { signal: lifetime.signal });
  window.addEventListener('pagehide', clear, { signal: lifetime.signal });
  document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); }, { signal: lifetime.signal });
  chrome.storage.onChanged.addListener(settingsChanged);
  chrome.storage.local.get('features').then(data => {
    if (!stopped) { enabled = data.features?.playerShortcuts !== false; clear(); }
  }).catch(() => { if (!connected()) stop(); });
})();
