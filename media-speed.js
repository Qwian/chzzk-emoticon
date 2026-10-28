(() => {
  if (globalThis.__chzzkMediaSpeed) return;
  globalThis.__chzzkMediaSpeed = true;
  const media = new Set(), roots = new WeakSet(), frameInfo = new WeakMap(), observers = new Set();
  let enabled = true, desiredRate = null, toastTimer = 0, remoteMediaUntil = 0, reportTimer = 0, stopped = false;
  function unwatch(element) {
    element.removeEventListener("loadedmetadata", onMediaEvent);
    element.removeEventListener("ratechange", onMediaEvent);
    const info = frameInfo.get(element);
    if (info?.callback != null) element.cancelVideoFrameCallback?.(info.callback);
    frameInfo.delete(element);
    delete element.dataset.chzzkToolsManualRate;
    media.delete(element);
  }
  function stop() {
    if (stopped) return;
    stopped = true; enabled = false; desiredRate = null; remoteMediaUntil = 0;
    clearInterval(reportTimer); clearTimeout(toastTimer);
    window.removeEventListener("keydown", onKeydown, true);
    observers.forEach(observer => observer.disconnect()); observers.clear();
    [...media].forEach(unwatch);
    document.querySelector("#media-speed-toast")?.remove();
    // Chrome may reject even listener removal after an extension reload.
    try { chrome.runtime.onMessage.removeListener(onMessage); } catch { /* already invalidated */ }
    try { chrome.storage.onChanged.removeListener(onStorageChange); } catch { /* already invalidated */ }
  }
  function connected() {
    if (stopped) return false;
    try { if (chrome.runtime.id) return true; } catch { /* invalidated API getter */ }
    stop(); return false;
  }
  function apiFailure(error) {
    if (/extension context invalidated/i.test(error?.message || "") || !connected()) stop();
  }
  async function send(message, showFailure = false) {
    if (!connected()) return;
    try {
      // sendMessage can throw before returning a Promise after the extension is reloaded.
      return await chrome.runtime.sendMessage(message);
    } catch (error) {
      apiFailure(error);
      if (showFailure && !stopped) toast("확장과 페이지를 새로고침해 주세요.");
    }
  }
  const isAd = element => element.closest("#midAdPlayerWrapper,#preAdPlayerWrapper");
  function visible(element) { const r = element.getBoundingClientRect(); return r.width > 16 && r.height > 16; }
  function bestVideo() {
    return [...media].filter(v => v.isConnected && v.tagName === "VIDEO" && visible(v) && !isAd(v))
      .sort((a, b) => { const area = v => { const r = v.getBoundingClientRect(); return r.width * r.height * (v.paused ? 1 : 2); }; return area(b) - area(a); })[0];
  }
  function toast(text) {
    if (stopped) return;
    let element = document.querySelector("#media-speed-toast");
    if (!element) {
      element = document.createElement("div"); element.id = "media-speed-toast"; element.setAttribute("role", "status");
      element.style.cssText = "position:fixed;left:24px;top:80px;z-index:2147483647;background:#102019ed;color:#b5ffdc;padding:10px 16px;border-radius:8px;font:700 15px system-ui;pointer-events:none";
      (document.fullscreenElement || document.documentElement).append(element);
    }
    element.textContent = text; element.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { element.hidden = true; }, 1600);
  }
  function applyRate(element) {
    if (!enabled || desiredRate === null || isAd(element)) return;
    try {
      element.dataset.chzzkToolsManualRate = String(desiredRate);
      if (Math.abs(element.playbackRate - desiredRate) > 0.001) element.playbackRate = desiredRate;
    } catch { toast("이 플레이어가 지원하지 않는 배속입니다."); }
  }
  function watchFrames(video) {
    if (!video.requestVideoFrameCallback || frameInfo.has(video)) return;
    const info = { samples: [], previous: null, callback: null }; frameInfo.set(video, info);
    function sample(_now, data) {
      info.callback = null;
      if (stopped || !video.isConnected) return;
      const previous = info.previous;
      if (previous) {
        const delta = data.mediaTime - previous.mediaTime, frames = data.presentedFrames - previous.presentedFrames;
        const fps = frames / delta;
        if (delta > 0 && delta < 1 && frames > 0 && fps >= 10 && fps <= 240) {
          info.samples.push(fps); if (info.samples.length > 20) info.samples.shift();
        }
      }
      info.previous = { mediaTime: data.mediaTime, presentedFrames: data.presentedFrames };
      info.callback = video.requestVideoFrameCallback(sample);
    }
    info.callback = video.requestVideoFrameCallback(sample);
  }
  function onMediaEvent(event) { applyRate(event.currentTarget); }
  function register(element) {
    if (stopped || media.has(element)) return;
    media.add(element); if (element.tagName === "VIDEO") watchFrames(element);
    element.addEventListener("loadedmetadata", onMediaEvent);
    element.addEventListener("ratechange", onMediaEvent);
    applyRate(element);
  }
  function scan(root) {
    if (root.matches?.("video,audio")) register(root);
    root.querySelectorAll?.("video,audio").forEach(register);
    if (root.shadowRoot) observe(root.shadowRoot);
    root.querySelectorAll?.("*").forEach(element => { if (element.shadowRoot) observe(element.shadowRoot); });
  }
  function observe(root) {
    if (roots.has(root)) return;
    roots.add(root); scan(root);
    const observer = new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
      if (node.nodeType === 1) scan(node);
    })));
    observers.add(observer); observer.observe(root, { childList: true, subtree: true });
  }
  function step(direction) {
    const video = bestVideo();
    if (!video || !Number.isFinite(video.currentTime) || !video.readyState) return { ok: false };
    const samples = frameInfo.get(video)?.samples || [];
    const fps = samples.length >= 3 ? [...samples].sort((a, b) => a - b)[Math.floor(samples.length / 2)] : 30;
    const frame = 1 / fps;
    let target = video.currentTime + direction * frame;
    if (video.seekable.length) {
      const ranges = Array.from({ length: video.seekable.length }, (_, i) => [video.seekable.start(i), video.seekable.end(i)]);
      const range = ranges.find(([start, end]) => video.currentTime >= start && video.currentTime <= end);
      if (!range) return { ok: false };
      target = Math.max(range[0], Math.min(range[1] - 0.001, target));
    } else if (Number.isFinite(video.duration)) target = Math.max(0, Math.min(video.duration, target));
    else return { ok: false };
    video.pause(); video.currentTime = Math.max(0, target);
    video.dispatchEvent(new CustomEvent("chzzk-tools:frame-step", { bubbles: true }));
    toast(`${direction > 0 ? "다음" : "이전"} 프레임${samples.length < 3 ? " · 30fps 추정" : ""}`);
    return { ok: true, fps, estimated: samples.length < 3 };
  }
  function report() {
    if (!connected()) return;
    for (const element of media) if (!element.isConnected) unwatch(element);
    if (!media.size && !document.querySelector("iframe")) return;
    const video = bestVideo(), rect = video?.getBoundingClientRect();
    send({ type: "MEDIA_FRAME_REPORT", score: rect ? rect.width * rect.height : 0 }).then(response => {
      if (!stopped && response?.rate != null && desiredRate === null) { desiredRate = response.rate; media.forEach(applyRate); }
    });
  }
  function onKeydown(event) {
    if (!enabled || event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey ||
        !["Comma", "Period", "Slash"].includes(event.code) || event.code === "Slash" && event.shiftKey) return;
    if (event.composedPath().some(node => node.matches?.("input,textarea,select,[contenteditable]:not([contenteditable='false']),[role='textbox']") || node.isContentEditable)) return;
    if (!connected()) return;
    const video = bestVideo(), audio = [...media].find(v => v.isConnected && v.tagName === "AUDIO" && !v.paused);
    const frame = !video && performance.now() < remoteMediaUntil && document.querySelector("iframe");
    if (!video && !audio && !frame || event.shiftKey && !video && !frame) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const message = event.shiftKey ? { action: "step", direction: event.code === "Comma" ? -1 : 1, hasVideo: Boolean(video) } :
      { action: event.code === "Slash" ? "reset" : event.code === "Comma" ? "decrease" : "increase", currentRate: (video || audio)?.playbackRate || 1 };
    send({ type: "MEDIA_SPEED_COMMAND", ...message }, true).then(response => {
      if (!stopped && response?.rate != null) toast(`${response.rate.toFixed(1)}배`);
    });
  }
  function onMessage(message, _sender, respond) {
    if (stopped) return;
    if (message.type === "GET_TOOL_STATUS") {
      document.dispatchEvent(new Event("chzzk-tools:quality-query"));
      respond({ ok: true, codeVersion: "0.7.0", quality: globalThis.__chzzkQualityStatus,
        videoHeight: bestVideo()?.videoHeight || 0 }); return;
    }
    if (message.type === "MEDIA_FRAME_AVAILABLE") { remoteMediaUntil = message.available ? performance.now() + 9000 : 0; return; }
    if (!enabled) return;
    if (message.type === "MEDIA_SPEED_APPLY" && Number.isFinite(message.rate) && message.rate >= 0.1 && message.rate <= 16) {
      desiredRate = message.rate; media.forEach(applyRate); respond({ ok: true });
    } else if (message.type === "MEDIA_FRAME_STEP") respond(step(message.direction === -1 ? -1 : 1));
  }
  function onStorageChange(changes, area) {
    if (stopped || area !== "local" || !changes.features) return;
    enabled = changes.features.newValue?.globalSpeed !== false;
    if (!enabled) { desiredRate = null; media.forEach(element => delete element.dataset.chzzkToolsManualRate); }
  }
  if (!connected()) return;
  window.addEventListener("keydown", onKeydown, true);
  try {
    chrome.runtime.onMessage.addListener(onMessage);
    chrome.storage.onChanged.addListener(onStorageChange);
    chrome.storage.local.get("features").then(data => {
      if (!stopped) enabled = data.features?.globalSpeed !== false;
    }).catch(apiFailure);
  } catch (error) { apiFailure(error); }
  if (stopped) return;
  observe(document); reportTimer = setInterval(report, 4000); report();
})();
