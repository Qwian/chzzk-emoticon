const mediaTabs = new Map();
function tabState(id) {
  if (!mediaTabs.has(id)) mediaTabs.set(id, { rate: null, resumeRate: null, frames: new Map(), zoomFrames: new Map(), badgeQueue: Promise.resolve(), badgeText: null });
  return mediaTabs.get(id);
}
function primaryFrame(state) {
  const frames = [...state.frames.values()].filter(info => Date.now() - info.time < 15000 && info.rate !== null);
  frames.sort((a, b) => b.mediaScore - a.mediaScore);
  return frames[0];
}
function updateBadge(tabId, state) {
  const rate = primaryFrame(state)?.rate;
  const text = rate == null ? "" : String(Math.round(rate * 100) / 100);
  if (state.badgeText === text) return state.badgeQueue;
  state.badgeText = text;
  state.badgeQueue = state.badgeQueue.catch(() => {}).then(async () => {
    await chrome.action.setBadgeBackgroundColor({ tabId, color: "#102D29" });
    await chrome.action.setBadgeTextColor({ tabId, color: "#80FFD5" });
    await chrome.action.setBadgeText({ tabId, text });
    await chrome.action.setTitle({ tabId, title: rate == null ? "치지직 편의 도구 설정" : `치지직 편의 도구 · 현재 ${text}배속` });
  }).catch(() => { state.badgeText = null; }); // The tab may close while the action is updating.
  return state.badgeQueue;
}
chrome.tabs.onRemoved.addListener(id => mediaTabs.delete(id));
chrome.tabs.onUpdated.addListener((id, change) => {
  if (change.status !== "loading") return;
  const state = tabState(id);
  state.frames.clear(); state.zoomFrames.clear(); updateBadge(id, state);
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  if (message.type === "MEDIA_ZOOM_COMMAND") {
    // Only this extension's popup may name another tab. Content scripts are
    // always restricted to their own tab, including cross-origin iframes.
    const popup = sender.url === chrome.runtime.getURL("popup.html");
    const tabId = popup ? message.tabId : sender.tab?.id;
    if (!Number.isInteger(tabId) || !["state", "open", "toggle", "increase", "decrease", "set", "reset", "pan", "center"].includes(message.action)) return;
    const command = async () => {
      const state = tabState(tabId);
      if (["state", "open"].includes(message.action) || ![...state.zoomFrames.values()].some(info => info.score > 0 && Date.now() - info.time < 1500)) {
        chrome.tabs.sendMessage(tabId, { type: "MEDIA_ZOOM_DISCOVER" }).catch(() => {});
        // A broadcast's Promise resolves with only the first frame's reply.
        // Allow all frames to report before choosing the main video.
        await new Promise(resolve => setTimeout(resolve, 80));
      }
      const frames = [...state.zoomFrames].filter(([, info]) => info.score > 0 && Date.now() - info.time < 10000).sort((a, b) => b[1].score - a[1].score);
      for (const [frameId] of frames) {
        const response = await Promise.race([
          chrome.tabs.sendMessage(tabId, { type: "MEDIA_ZOOM_APPLY", action: message.action, scale: message.scale, step: message.step, x: message.x, y: message.y }, { frameId }).catch(() => null),
          new Promise(resolve => setTimeout(() => resolve(null), 300))
        ]);
        if (response?.ok) return response;
        state.zoomFrames.delete(frameId);
      }
      return { ok: false };
    };
    command().then(respond, () => respond({ ok: false })); return true;
  }
  if (!Number.isInteger(sender.tab?.id) || sender.id !== chrome.runtime.id) return;
  const tabId = sender.tab.id, state = tabState(tabId);
  if (message.type === "MEDIA_ZOOM_FRAME") {
    state.zoomFrames.set(sender.frameId, { score: Number.isFinite(message.score) ? Math.max(0, message.score) : 0, time: Date.now() });
    for (const [id, info] of state.zoomFrames) if (Date.now() - info.time > 10000) state.zoomFrames.delete(id);
    respond({ ok: true }); return;
  }
  if (message.type === "MEDIA_SPEED_NOTICE" && typeof message.text === "string") {
    chrome.tabs.sendMessage(tabId, { type: "MEDIA_SPEED_NOTICE", text: message.text.slice(0, 100) }, { frameId: 0 }).catch(() => {});
    respond({ ok: true }); return;
  }
  if (message.type === "MEDIA_FRAME_REPORT") {
    if (sender.frameId === 0 && message.hasIframes === false) {
      for (const id of state.frames.keys()) if (id !== 0) state.frames.delete(id);
    }
    state.frames.set(sender.frameId, {
      score: Number(message.score) || 0, mediaScore: Number(message.mediaScore) || 0,
      rate: Number.isFinite(message.rate) && message.rate > 0 ? message.rate : null, time: Date.now()
    });
    for (const [id, info] of state.frames) if (Date.now() - info.time > 15000) state.frames.delete(id);
    if (message.enabled === false) state.rate = null;
    updateBadge(tabId, state);
    chrome.tabs.sendMessage(tabId, { type: "MEDIA_FRAME_AVAILABLE", available: [...state.frames.values()].some(info => info.score > 0), rate: primaryFrame(state)?.rate }).catch(() => {});
    respond({ rate: state.rate }); return;
  }
  if (message.type !== "MEDIA_SPEED_COMMAND") return;
  const command = async () => {
    if (message.action === "step") {
      let frameId = sender.frameId;
      if (!message.hasVideo) {
        const frames = [...state.frames].filter(([, value]) => value.score > 0 && Date.now() - value.time < 10000);
        frames.sort((a, b) => b[1].score - a[1].score);
        if (!frames.length) return { ok: false };
        frameId = frames[0][0];
      }
      return await chrome.tabs.sendMessage(tabId, { type: "MEDIA_FRAME_STEP", direction: message.direction === -1 ? -1 : 1 }, { frameId });
    }
    if (!["increase", "decrease", "reset"].includes(message.action)) return { ok: false };
    const observed = message.hasMedia === false ? primaryFrame(state)?.rate : message.currentRate;
    const current = state.rate ?? (Number.isFinite(observed) ? observed : 1);
    if (message.action === "reset") {
      if (Math.abs(current - 1) > 0.001) { state.resumeRate = Math.max(0.1, Math.min(16, current)); state.rate = 1; }
      else state.rate = state.resumeRate ?? 1;
    } else {
      state.rate = Math.max(0.1, Math.min(16, Math.round((current + (message.action === "increase" ? 0.1 : -0.1)) * 10) / 10));
      if (Math.abs(state.rate - 1) > 0.001) state.resumeRate = state.rate;
      else if (Math.abs(current - 1) > 0.001) state.resumeRate = current;
    }
    // Compute/respond immediately. An unresponsive iframe must not queue keys or other tabs.
    chrome.tabs.sendMessage(tabId, { type: "MEDIA_SPEED_APPLY", rate: state.rate,
      clientId: message.clientId, commandId: message.commandId }).catch(() => {});
    return { ok: true, rate: state.rate };
  };
  command().then(respond, () => respond({ ok: false }));
  return true;
});
