const mediaTabs = new Map();
let speedQueue = Promise.resolve();
function tabState(id) {
  if (!mediaTabs.has(id)) mediaTabs.set(id, { rate: null, frames: new Map() });
  return mediaTabs.get(id);
}
chrome.tabs.onRemoved.addListener(id => mediaTabs.delete(id));
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!sender.tab?.id || sender.id !== chrome.runtime.id) return;
  const tabId = sender.tab.id, state = tabState(tabId);
  if (message.type === "MEDIA_FRAME_REPORT") {
    state.frames.set(sender.frameId, { score: Number(message.score) || 0, time: Date.now() });
    for (const [id, info] of state.frames) if (Date.now() - info.time > 15000) state.frames.delete(id);
    chrome.tabs.sendMessage(tabId, { type: "MEDIA_FRAME_AVAILABLE", available: [...state.frames.values()].some(info => info.score > 0) }).catch(() => {});
    respond({ rate: state.rate }); return;
  }
  if (message.type !== "MEDIA_SPEED_COMMAND") return;
  speedQueue = speedQueue.catch(() => {}).then(async () => {
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
    const current = state.rate ?? (Number.isFinite(message.currentRate) ? message.currentRate : 1);
    state.rate = message.action === "reset" ? 1 : Math.max(0.1, Math.min(16, Math.round((current + (message.action === "increase" ? 0.1 : -0.1)) * 10) / 10));
    await chrome.tabs.sendMessage(tabId, { type: "MEDIA_SPEED_APPLY", rate: state.rate }).catch(() => {});
    return { ok: true, rate: state.rate };
  });
  speedQueue.then(respond, () => respond({ ok: false }));
  return true;
});
