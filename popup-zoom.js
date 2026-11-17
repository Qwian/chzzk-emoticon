(() => {
  const panel = document.querySelector("#video-zoom"), output = panel.querySelector("output"), range = panel.querySelector("input");
  const status = panel.querySelector("[role=status]");
  let tabId, serial = 0, queue = Promise.resolve();
  async function command(action, extra = {}) {
    const id = ++serial;
    queue = queue.catch(() => {}).then(async () => {
      if (action === "set" && id !== serial) return;
      try {
        if (!Number.isInteger(tabId)) [tabId] = (await chrome.tabs.query({ active: true, currentWindow: true })).map(tab => tab.id);
        const result = await chrome.runtime.sendMessage({ type: "MEDIA_ZOOM_COMMAND", tabId, action, ...extra });
        if (id !== serial) return;
        if (!result?.ok) { status.textContent = "영상을 찾지 못했습니다. 확장과 방송 탭을 새로고침하세요."; return; }
        output.textContent = `${Math.round(result.scale * 100)}%`; range.value = String(Math.round(result.scale * 100));
        status.textContent = "영상만 확대합니다. 확대 후 방향 버튼이나 화면 끌기로 이동하세요.";
      } catch { status.textContent = "이 페이지에서는 영상에 연결할 수 없습니다."; }
    });
    return queue;
  }
  panel.querySelectorAll("button").forEach(button => button.addEventListener("click", () => {
    command(button.dataset.action, { x: Number(button.dataset.x) || 0, y: Number(button.dataset.y) || 0 });
  }));
  range.addEventListener("input", () => command("set", { scale: Number(range.value) / 100 }));
  command("state");
})();
