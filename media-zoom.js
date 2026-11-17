(() => {
  if (globalThis.__chzzkMediaZoom) return;
  globalThis.__chzzkMediaZoom = true;
  const states = new Map(), observers = new Set(), roots = new WeakSet();
  const properties = ["scale", "translate", "transform-origin", "clip-path", "transition"];
  let enabled = true, stopped = false, selected = null, host, ui, panel, dragSurface, resizeObserver;
  let expanded = false, dragging = false, layoutFrame = 0, reportTimer;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const excluded = "#midAdPlayerWrapper,#preAdPlayerWrapper,.webplayer-internal-core-ad-ui,#chzzk-sidebar-preview,#cheese-follow-preview,[id^=chzzk-tools-preview-],[data-media-preview]";
  function connected() {
    try { if (!stopped && chrome.runtime.id) return true; } catch { /* extension reloaded */ }
    stop(); return false;
  }
  async function send(message) {
    if (!connected()) return;
    try { return await chrome.runtime.sendMessage(message); }
    catch (error) { if (/extension context invalidated/i.test(error?.message || "")) stop(); }
  }
  function restore(video, state) {
    if (!state.original) return;
    for (const [name, value, priority] of state.original) {
      if (value) video.style.setProperty(name, value, priority);
      else video.style.removeProperty(name);
    }
    state.original = null;
  }
  function baseRect(video) {
    const r = video.getBoundingClientRect(), state = states.get(video);
    if (!state?.original) return r;
    const width = r.width / state.scale, height = r.height / state.scale;
    const left = r.left + (r.width - width) / 2 - state.dx;
    const top = r.top + (r.height - height) / 2 - state.dy;
    return { left, top, width, height, right: left + width, bottom: top + height };
  }
  function candidates() {
    const fs = document.fullscreenElement;
    return [...states.keys()].filter(video => {
      if (!video.isConnected || video.closest(excluded) || fs && fs !== video && !fs.contains(video)) return false;
      const r = baseRect(video), style = getComputedStyle(video);
      return r.width > 32 && r.height > 32 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight &&
        style.visibility !== "hidden" && style.opacity !== "0";
    });
  }
  function score(video) {
    const r = baseRect(video);
    return Math.max(0, Math.min(innerWidth, r.right) - Math.max(0, r.left)) *
      Math.max(0, Math.min(innerHeight, r.bottom) - Math.max(0, r.top)) * (video.paused ? 1 : 2);
  }
  function best() { return candidates().sort((a, b) => score(b) - score(a))[0] || null; }
  function target() { return candidates().includes(selected) ? selected : best(); }
  function select(video) {
    if (selected === video) return;
    selected = video; resizeObserver?.disconnect();
    if (video) resizeObserver?.observe(video);
  }
  function apply(video) {
    const state = states.get(video);
    if (!state) return;
    const r = baseRect(video);
    state.dx = -state.x * r.width * (state.scale - 1) / 2;
    state.dy = -state.y * r.height * (state.scale - 1) / 2;
    if (state.scale === 1) {
      restore(video, state); state.x = state.y = state.dx = state.dy = 0;
    } else {
      if (!state.original) state.original = properties.map(name => [name, video.style.getPropertyValue(name), video.style.getPropertyPriority(name)]);
      const set = (name, value) => video.style.setProperty(name, value, "important");
      set("scale", String(state.scale)); set("translate", `${state.dx}px ${state.dy}px`);
      set("transform-origin", "50% 50%"); set("transition", "none");
      // Clip in the video's own coordinates so its enlarged pixels stay inside
      // the original video box, even when the site leaves overflow visible.
      const inset = (1 - 1 / state.scale) * 50;
      const x = r.width ? state.dx / (state.scale * r.width) * 100 : 0;
      const y = r.height ? state.dy / (state.scale * r.height) * 100 : 0;
      set("clip-path", `inset(${inset - y}% ${inset + x}% ${inset + y}% ${inset - x}%)`);
    }
    scheduleLayout();
  }
  function zoom(video, value, anchor) {
    const state = states.get(video), r = baseRect(video), previous = state.scale;
    state.scale = clamp(Math.round(value * 100) / 100, 1, 5);
    if (anchor && state.scale > 1) {
      const dx = anchor.x - r.left - r.width / 2, dy = anchor.y - r.top - r.height / 2;
      const offsetX = dx - (dx - state.dx) * state.scale / previous;
      const offsetY = dy - (dy - state.dy) * state.scale / previous;
      state.x = clamp(-offsetX / (r.width * (state.scale - 1) / 2), -1, 1);
      state.y = clamp(-offsetY / (r.height * (state.scale - 1) / 2), -1, 1);
    }
    apply(video);
  }
  function execute(message) {
    const video = target();
    if (!enabled || !video) return { ok: false };
    select(video);
    const state = states.get(video);
    switch (message.action) {
      case "increase": zoom(video, state.scale + .25); break;
      case "decrease": zoom(video, state.scale - .25); break;
      case "set": if (Number.isFinite(message.scale)) zoom(video, message.scale); break;
      case "reset": zoom(video, 1); dragging = false; break;
      case "pan":
        state.x = clamp(state.x + clamp(Number(message.x) || 0, -1, 1), -1, 1);
        state.y = clamp(state.y + clamp(Number(message.y) || 0, -1, 1), -1, 1);
        apply(video); break;
      case "center": state.x = state.y = 0; apply(video); break;
      case "toggle": expanded = !expanded; if (!expanded) dragging = false; break;
      case "open": expanded = true; break;
    }
    scheduleLayout();
    return { ok: true, scale: state.scale, x: state.x, y: state.y, expanded };
  }
  function createUI() {
    if (host) return;
    host = document.createElement("div"); host.id = "media-zoom-controls";
    host.style.cssText = "all:initial!important;position:fixed!important;inset:auto!important;left:0!important;top:0!important;margin:0!important;padding:0!important;border:0!important;background:transparent!important;overflow:visible!important;z-index:2147483646!important;pointer-events:none!important";
    ui = host.attachShadow({ mode: "open" });
    ui.innerHTML = `<style>
      :host{font:13px/1.4 system-ui;color:#fff;color-scheme:dark}
      *{box-sizing:border-box} [hidden]{display:none!important}
      button{font:600 13px system-ui;color:#fff;background:#25352f;border:1px solid #ffffff30;border-radius:6px;min-height:32px;min-width:32px;padding:4px 8px;cursor:pointer;touch-action:manipulation}
      button:hover,button:focus-visible{background:#39604f;outline:2px solid #80ffd5;outline-offset:1px}
      #launcher{position:absolute;right:0;top:0;pointer-events:auto;background:#12251cda;white-space:nowrap}
      #panel{position:absolute;top:38px;right:0;width:228px;max-width:calc(100vw - 16px);background:#101c18f5;color:#eafff6;font:13px/1.4 system-ui;border:1px solid #80ffd54d;box-shadow:0 3px 16px #0008;border-radius:9px;padding:10px;pointer-events:auto}
      .row{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:8px}
      input{width:100%;margin:0 0 8px;accent-color:#00dc91}
      .pad{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin:8px 0}
      #up{grid-column:2} #left{grid-column:1} #down{grid-column:2}
      #drag[aria-pressed=true]{background:#006d49;border-color:#80ffd5}
      small{display:block;color:#bed2c7;font:11px/1.5 system-ui}
      #surface{position:fixed;touch-action:none;pointer-events:auto;cursor:grab;background:transparent}
      #surface:active{cursor:grabbing}
    </style><div id="surface" hidden aria-label="확대한 영상 이동 영역"></div>
    <button id="launcher" title="방송 영상 확대·이동 (Alt+Z)" aria-expanded="false">영상 확대</button>
    <section id="panel" hidden aria-label="방송 영상 확대·이동">
      <div class="row"><button id="minus" aria-label="영상 축소">−</button><output id="value" aria-live="polite">100%</output><button id="plus" aria-label="영상 확대">＋</button><button id="reset">원래대로</button></div>
      <input id="scale" type="range" min="100" max="500" step="5" value="100" aria-label="영상 확대 배율">
      <button id="drag" aria-pressed="false">화면 끌어서 이동</button>
      <div class="pad"><button id="up" aria-label="영상 위쪽 보기">↑</button><button id="left" aria-label="영상 왼쪽 보기">←</button><button id="center">가운데</button><button id="right" aria-label="영상 오른쪽 보기">→</button><button id="down" aria-label="영상 아래쪽 보기">↓</button></div>
      <small>Alt+휠: 확대·축소<br>Alt+드래그 / Alt+방향키: 이동<br>Alt+0: 초기화 · Alt+Z: 접기</small>
    </section>`;
    panel = ui.querySelector("#panel"); dragSurface = ui.querySelector("#surface");
    const click = (id, action, extra = {}) => ui.querySelector(id).addEventListener("click", () => execute({ action, ...extra }));
    click("#launcher", "toggle"); click("#plus", "increase"); click("#minus", "decrease"); click("#reset", "reset"); click("#center", "center");
    click("#left", "pan", { x: -.2 }); click("#right", "pan", { x: .2 });
    click("#up", "pan", { y: -.2 }); click("#down", "pan", { y: .2 });
    ui.querySelector("#scale").addEventListener("input", event => execute({ action: "set", scale: Number(event.target.value) / 100 }));
    ui.querySelector("#drag").addEventListener("click", () => { dragging = !dragging; scheduleLayout(); });
    // Keep extension controls out of native player shortcuts, including Space/F.
    ui.addEventListener("keydown", event => { if (!event.altKey) event.stopPropagation(); });
    ui.addEventListener("click", event => event.stopPropagation());
  }
  function layout() {
    layoutFrame = 0;
    if (stopped) return;
    for (const [video, state] of states) if (!video.isConnected) { restore(video, state); states.delete(video); }
    const video = enabled && target();
    if (!video) { if (host) host.style.setProperty("display", "none", "important"); select(null); return; }
    select(video); createUI();
    host.style.setProperty("display", "block", "important");
    const fs = document.fullscreenElement, canPopover = typeof host.showPopover === "function";
    const parent = fs && fs.tagName !== "VIDEO" && fs.tagName !== "IFRAME" ? fs : document.documentElement;
    if (host.parentNode !== parent) parent.append(host);
    if (canPopover) {
      try { host.setAttribute("popover", "manual"); if (!host.matches(":popover-open")) host.showPopover(); } catch { /* older browsers */ }
    }
    const r = baseRect(video), state = states.get(video);
    const right = Math.min(innerWidth - 8, r.right - 8), top = Math.max(8, r.top + 8);
    host.style.setProperty("left", `${Math.max(8, right)}px`, "important");
    host.style.setProperty("top", `${Math.min(innerHeight - 40, top)}px`, "important");
    panel.hidden = !expanded;
    // Scroll the panel rather than clipping controls on a small player/screen.
    panel.style.maxHeight = `${Math.max(40, innerHeight - Math.min(innerHeight - 40, top) - 46)}px`;
    panel.style.overflowY = "auto";
    ui.querySelector("#launcher").setAttribute("aria-expanded", String(expanded));
    ui.querySelector("#launcher").textContent = expanded ? "접기" : state.scale > 1 ? `영상 ${Math.round(state.scale * 100)}%` : "영상 확대";
    ui.querySelector("#value").textContent = `${Math.round(state.scale * 100)}%`;
    ui.querySelector("#scale").value = String(Math.round(state.scale * 100));
    ui.querySelector("#drag").setAttribute("aria-pressed", String(dragging));
    dragSurface.hidden = !dragging || state.scale <= 1 || !expanded;
    Object.assign(dragSurface.style, { left: `${Math.max(0, r.left)}px`, top: `${Math.max(0, r.top)}px`,
      width: `${Math.max(0, Math.min(innerWidth, r.right) - Math.max(0, r.left))}px`,
      height: `${Math.max(0, Math.min(innerHeight, r.bottom) - Math.max(0, r.top))}px` });
  }
  function scheduleLayout() { if (!stopped && !layoutFrame) layoutFrame = requestAnimationFrame(layout); }
  function register(video) {
    if (states.has(video)) return;
    states.set(video, { scale: 1, x: 0, y: 0, dx: 0, dy: 0, original: null });
  }
  function scan(root) {
    if (root.matches?.("video")) register(root);
    root.querySelectorAll?.("video").forEach(register);
    if (root.shadowRoot) observe(root.shadowRoot);
    root.querySelectorAll?.("*").forEach(node => { if (node.shadowRoot) observe(node.shadowRoot); });
  }
  function observe(root) {
    if (roots.has(root)) return;
    roots.add(root); scan(root);
    const observer = new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1 && node !== host) scan(node);
      scheduleLayout();
    });
    observer.observe(root, { childList: true, subtree: true }); observers.add(observer);
  }
  const editable = event => event.composedPath().some(node => node.matches?.("input,textarea,select,[contenteditable]:not([contenteditable=false]),[role=textbox]") || node.isContentEditable);
  function onKey(event) {
    if (!enabled || event.defaultPrevented || event.isComposing || !event.altKey || event.ctrlKey || event.metaKey || editable(event)) return;
    const actions = { KeyZ: "toggle", Equal: "increase", NumpadAdd: "increase", Minus: "decrease", NumpadSubtract: "decrease", Digit0: "reset", Numpad0: "reset",
      ArrowLeft: "pan", ArrowRight: "pan", ArrowUp: "pan", ArrowDown: "pan" };
    const action = actions[event.code];
    if (!action || event.shiftKey && event.code !== "Equal" || !target() && window === window.top && !document.querySelector("iframe")) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.repeat && ["toggle", "reset"].includes(action)) return;
    const message = { action, x: event.code === "ArrowLeft" ? -.1 : event.code === "ArrowRight" ? .1 : 0,
      y: event.code === "ArrowUp" ? -.1 : event.code === "ArrowDown" ? .1 : 0 };
    if (target()) execute(message);
    else send({ type: "MEDIA_ZOOM_COMMAND", ...message });
  }
  function videoAt(event) {
    if (event.composedPath().includes(host) && !event.composedPath().includes(dragSurface)) return null;
    return candidates().sort((a, b) => score(b) - score(a)).find(video => {
      const r = baseRect(video);
      return event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
    });
  }
  function onWheel(event) {
    if (!enabled || !event.altKey || event.ctrlKey || event.metaKey || editable(event) || !event.deltaY) return;
    const video = videoAt(event); if (!video) return;
    event.preventDefault(); event.stopImmediatePropagation(); select(video);
    zoom(video, states.get(video).scale + (event.deltaY < 0 ? .1 : -.1), { x: event.clientX, y: event.clientY });
  }
  let gesture = null, suppressClickUntil = 0;
  function nativeFullscreenControl(event) {
    if (document.fullscreenElement?.tagName !== "VIDEO" || !ui || event.composedPath().includes(host)) return null;
    // Chromium's video-only fullscreen paints outside popovers but delivers
    // their pointer events to the native video surface. Route those deliberate
    // clicks to our visible controls, without touching the player's controls.
    return [...ui.querySelectorAll("button,input")].find(element => {
      const r = element.getBoundingClientRect();
      return r.width && r.height && event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
    });
  }
  function moveSlider(event, slider) {
    const r = slider.getBoundingClientRect();
    execute({ action: "set", scale: 1 + clamp((event.clientX - r.left) / r.width, 0, 1) * 4 });
  }
  function endGesture(event) {
    if (!gesture || event && event.pointerId !== gesture.id) return;
    suppressClickUntil = performance.now() + 400;
    try { gesture.capture?.releasePointerCapture(gesture.id); } catch { /* element removed */ }
    gesture = null;
  }
  function onPointerDown(event) {
    if (!enabled || event.button !== 0 || editable(event)) return;
    const control = nativeFullscreenControl(event);
    if (control) {
      event.preventDefault(); event.stopImmediatePropagation(); suppressClickUntil = performance.now() + 600;
      gesture = { id: event.pointerId, control, capture: event.target };
      try { event.target.setPointerCapture(event.pointerId); } catch { /* synthetic tests */ }
      if (control.tagName === "INPUT") moveSlider(event, control);
      else control.click();
      return;
    }
    const nativeDrag = dragging && expanded && document.fullscreenElement?.tagName === "VIDEO";
    if (!event.altKey && !(dragging && event.composedPath().includes(dragSurface)) && !nativeDrag) return;
    const video = videoAt(event); if (!video || states.get(video).scale <= 1) return;
    event.preventDefault(); event.stopImmediatePropagation(); select(video);
    const state = states.get(video), r = baseRect(video);
    gesture = { id: event.pointerId, startX: event.clientX, startY: event.clientY, x: state.x, y: state.y,
      maxX: r.width * (state.scale - 1) / 2, maxY: r.height * (state.scale - 1) / 2, capture: event.target };
    try { event.target.setPointerCapture(event.pointerId); } catch { /* synthetic tests */ }
    suppressClickUntil = performance.now() + 600;
  }
  function onPointerMove(event) {
    if (!gesture || event.pointerId !== gesture.id) return;
    if (gesture.control) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (gesture.control.tagName === "INPUT") moveSlider(event, gesture.control);
      return;
    }
    if (!selected?.isConnected) { endGesture(); return; }
    event.preventDefault(); event.stopImmediatePropagation();
    const state = states.get(selected);
    state.x = clamp(gesture.x - (event.clientX - gesture.startX) / gesture.maxX, -1, 1);
    state.y = clamp(gesture.y - (event.clientY - gesture.startY) / gesture.maxY, -1, 1);
    suppressClickUntil = performance.now() + 600; apply(selected);
  }
  function onClick(event) {
    if (performance.now() < suppressClickUntil && videoAt(event)) { event.preventDefault(); event.stopImmediatePropagation(); }
  }
  function onResize() {
    for (const [video, state] of states) if (video.isConnected && state.scale > 1) apply(video);
    scheduleLayout();
  }
  function onFullscreen() {
    try { if (host?.matches(":popover-open")) host.hidePopover(); } catch { /* unsupported */ }
    onResize();
  }
  function report() {
    if (!connected()) return;
    const video = enabled && best();
    send({ type: "MEDIA_ZOOM_FRAME", score: video ? score(video) : 0 }); scheduleLayout();
  }
  function onMessage(message, _sender, respond) {
    if (stopped) return;
    if (message.type === "MEDIA_ZOOM_APPLY") respond(execute(message));
    if (message.type === "MEDIA_ZOOM_DISCOVER") { report(); respond({ ok: true }); }
  }
  function onStorage(changes, area) {
    if (area !== "local" || !changes.features) return;
    enabled = changes.features.newValue?.videoZoom !== false;
    if (!enabled) {
      endGesture(); dragging = expanded = false;
      for (const [video, state] of states) { restore(video, state); state.scale = 1; state.x = state.y = state.dx = state.dy = 0; }
    }
    report();
  }
  function stop() {
    if (stopped) return; stopped = true;
    endGesture(); clearInterval(reportTimer); cancelAnimationFrame(layoutFrame); resizeObserver?.disconnect();
    observers.forEach(observer => observer.disconnect());
    for (const [video, state] of states) restore(video, state);
    states.clear(); host?.remove();
    for (const [name, fn] of events) window.removeEventListener(name, fn, true);
    document.removeEventListener("fullscreenchange", onFullscreen);
    try { chrome.runtime.onMessage.removeListener(onMessage); chrome.storage.onChanged.removeListener(onStorage); } catch { /* invalid context */ }
  }
  const events = [["keydown", onKey], ["wheel", onWheel], ["pointerdown", onPointerDown], ["pointermove", onPointerMove],
    ["pointerup", endGesture], ["pointercancel", endGesture], ["click", onClick], ["resize", onResize], ["scroll", scheduleLayout]];
  if (!connected()) return;
  for (const [name, fn] of events) window.addEventListener(name, fn, { capture: true, passive: false });
  document.addEventListener("fullscreenchange", onFullscreen);
  if (typeof ResizeObserver === "function") resizeObserver = new ResizeObserver(onResize);
  chrome.runtime.onMessage.addListener(onMessage); chrome.storage.onChanged.addListener(onStorage);
  chrome.storage.local.get("features").then(data => onStorage({ features: { newValue: data.features } }, "local")).catch(() => connected());
  observe(document); reportTimer = setInterval(report, 4000); report();
})();
