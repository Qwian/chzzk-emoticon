(() => {
  if (window.__chzzkPreviewBridge) return;
  window.__chzzkPreviewBridge = true;
  let active = null;
  async function close() {
    const previous = active; active = null;
    if (previous) try { await previous.player.close(); } catch { /* already closed by the native player */ }
  }
  document.addEventListener("chzzk-tools:soop-preview", async event => {
    const { action, requestId, videoId, parentId, streamer, broadcast } = event.detail || {};
    if (action === "close") { await close(); return; }
    const respond = (ok, message = "") => document.dispatchEvent(new CustomEvent("chzzk-tools:soop-preview-result", { detail: { requestId, ok, message } }));
    if (action !== "open" || !/^chzzk-tools-preview-/.test(videoId || "") || !/^chzzk-tools-preview-/.test(parentId || "") ||
        !/^[a-z0-9_-]+$/i.test(streamer || "") || !/^\d+$/.test(broadcast || "")) return;
    if (typeof window.PreviewPlayer !== "function") { respond(false, "숲 미리보기 플레이어가 아직 준비되지 않았습니다."); return; }
    await close();
    if (!document.getElementById(videoId)?.isConnected) return;
    try {
      const player = new window.PreviewPlayer({ id: videoId, parentId, muted: false, volume: 1,
        playDurationLimit: 60, refreshIntervalTime: 10, isDev: false });
      active = { player, videoId };
      player.addEventListener("STATUS_ERROR", () => respond(false, "이 방송은 목록 미리보기를 제공하지 않습니다."));
      await player.loadPreview(streamer, broadcast);
      if (active?.player !== player) return;
      player.muted = false; player.volume = 1;
      await player.play(); respond(true);
    } catch { respond(false, "미리보기를 재생하지 못했습니다."); }
  });
  window.setInterval(() => { if (active && !document.getElementById(active.videoId)?.isConnected) close(); }, 1000);
  window.addEventListener("pagehide", close);
})();
