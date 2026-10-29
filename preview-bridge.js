(() => {
  if (window.__chzzkPreviewBridge) return;
  window.__chzzkPreviewBridge = true;
  let active = null, generation = 0;
  async function close() {
    const previous = active; active = null;
    if (previous) try { await previous.player.close(); } catch { /* already closed by the native player */ }
  }
  document.addEventListener("chzzk-tools:soop-preview", async event => {
    const { action, requestId, videoId, parentId, streamer, broadcast } = event.detail || {};
    if (action === "close") { generation++; await close(); return; }
    const respond = (ok, message = "") => document.dispatchEvent(new CustomEvent("chzzk-tools:soop-preview-result", { detail: { requestId, ok, message } }));
    if (action !== "open" || !/^chzzk-tools-preview-/.test(videoId || "") || !/^chzzk-tools-preview-/.test(parentId || "") ||
        !/^[a-z0-9_-]+$/i.test(streamer || "") || !/^\d+$/.test(broadcast || "")) return;
    const turn = ++generation;
    if (typeof window.PreviewPlayer !== "function") { respond(false, "숲 미리보기 플레이어가 아직 준비되지 않았습니다."); return; }
    await close();
    if (turn !== generation || !document.getElementById(videoId)?.isConnected) return;
    try {
      const player = new window.PreviewPlayer({ id: videoId, parentId, muted: false, volume: 1,
        playDurationLimit: 60, refreshIntervalTime: 10, isDev: false });
      active = { player, videoId };
      let failed = false;
      player.addEventListener("STATUS_ERROR", () => {
        if (turn !== generation || active?.player !== player) return;
        failed = true;
        respond(false, "미리보기를 불러오지 못했습니다.");
      });
      await player.loadPreview(streamer, broadcast);
      if (failed || turn !== generation || active?.player !== player) return;
      player.muted = false; player.volume = 1;
      await player.play();
      if (!failed && turn === generation && active?.player === player) respond(true);
    } catch { if (turn === generation) respond(false, "미리보기를 재생하지 못했습니다."); }
  });
  window.setInterval(() => { if (active && !document.getElementById(active.videoId)?.isConnected) close(); }, 1000);
  window.addEventListener("pagehide", close);
})();
