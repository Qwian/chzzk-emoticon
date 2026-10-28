(() => {
  if (globalThis.__chzzkSiteTools) return;
  globalThis.__chzzkSiteTools = true;
  const core = globalThis.ChzzkTools;
  let settings = core.features(), currentPath = location.pathname;
  const searchHint = document.createElement("div");
  searchHint.id = "chzzk-tools-search-hint";
  searchHint.style.cssText = "position:fixed;z-index:10001;background:#14231c;color:#eafff1;padding:7px;border:1px solid #4e6c5b;border-radius:7px;font:12px system-ui;display:none";
  document.documentElement.append(searchHint);
  let searchTimer = 0, searchGeneration = 0, searchAbort = null, searchInput = null;
  let searchRows = [], selectedSearchRow = -1;
  const searchCache = new Map();

  function cancelSearch(hide = true) {
    window.clearTimeout(searchTimer);
    searchAbort?.abort();
    searchAbort = null;
    searchGeneration++;
    searchRows = []; selectedSearchRow = -1;
    if (hide) searchHint.style.display = "none";
  }

  async function findChannels(keyword, signal) {
    const cached = searchCache.get(keyword);
    if (cached && Date.now() - cached.time < 30000) return cached.rows;
    const url = new URL("https://api.chzzk.naver.com/service/v1/search/channels");
    url.search = new URLSearchParams({ keyword, offset: "0", size: "5" });
    const response = await fetch(url.href, { signal, credentials: "omit" });
    if (!response.ok) throw new Error("Channel search failed");
    const body = await response.json();
    if (body.code !== 200 || !Array.isArray(body.content?.data)) throw new Error("Invalid search response");
    const rows = body.content.data.map(row => row?.channel).filter(row =>
      /^[a-f0-9]{32}$/i.test(row?.channelId) && typeof row.channelName === "string");
    searchCache.set(keyword, { time: Date.now(), rows });
    if (searchCache.size > 32) searchCache.delete(searchCache.keys().next().value);
    return rows;
  }

  function searchLink(label, query) {
    const link = document.createElement("a");
    link.textContent = label;
    link.href = `/search?query=${encodeURIComponent(query)}`;
    link.style.cssText = "color:#00ffa3;margin:0 8px;text-decoration:underline";
    return link;
  }
  function updateSearch(input) {
    cancelSearch();
    searchInput = input;
    if (!settings.koreanSearch || input.id !== "search-input" || !input.value.trim() || input.value.length > 100) {
      return;
    }
    const original = input.value.trim(), converted = core.koreanFromEnglish(original);
    if (converted === original || !/[가-힣]/.test(converted) || !/[a-z]/i.test(original)) { searchHint.style.display = "none"; return; }
    const rect = input.getBoundingClientRect();
    const links = document.createElement("div");
    links.style.cssText = "display:flex;gap:8px;padding:8px 0 2px;border-top:1px solid #405449";
    links.append(searchLink(`${converted} 전체 검색`, converted), searchLink("영문 그대로 검색", original));
    const list = document.createElement("div");
    list.id = "chzzk-tools-channel-results";
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", "스트리머 검색 결과");
    const message = document.createElement("p");
    message.style.cssText = "margin:3px 8px 8px;color:#b6cabe";
    message.textContent = `${converted} · 스트리머 검색 중…`;
    message.setAttribute("role", "status");
    searchHint.replaceChildren(message, list, links);
    searchHint.style.left = `${Math.max(4, rect.left)}px`;
    searchHint.style.top = `${rect.bottom + 6}px`;
    searchHint.style.width = `${Math.min(460, Math.max(280, rect.width))}px`;
    searchHint.style.maxWidth = "calc(100vw - 16px)";
    searchHint.style.display = "block";
    const generation = searchGeneration;
    searchTimer = window.setTimeout(async () => {
      const controller = new AbortController();
      searchAbort = controller;
      const timeout = window.setTimeout(() => controller.abort(), 4000);
      const responses = [null, null];
      function renderResults() {
        if (generation !== searchGeneration || input.value.trim() !== original || !settings.koreanSearch) return;
        const selectedHref = searchRows[selectedSearchRow]?.href;
        const channels = new Map();
        for (const response of responses) if (response?.status === "fulfilled") {
          for (const row of response.value) if (!channels.has(row.channelId)) channels.set(row.channelId, row);
        }
        searchRows = [...channels.values()].slice(0, 8).map((channel, index) => {
          const link = document.createElement("a");
          link.id = `chzzk-tools-channel-${index}`;
          link.href = channel.openLive ? `/live/${channel.channelId}` : `/${channel.channelId}`;
          link.setAttribute("role", "option");
          link.setAttribute("aria-selected", "false");
          link.style.cssText = "display:flex;align-items:center;gap:10px;padding:9px 8px;color:#effff4;text-decoration:none;border-radius:5px";
          if (typeof channel.channelImageUrl === "string" && channel.channelImageUrl.startsWith("https://")) {
            const image = document.createElement("img");
            image.src = channel.channelImageUrl; image.alt = ""; image.width = image.height = 28;
            image.style.cssText = "border-radius:50%;object-fit:cover";
            link.append(image);
          }
          const name = document.createElement("span"); name.textContent = channel.channelName;
          link.append(name);
          if (channel.openLive) {
            const live = document.createElement("span"); live.textContent = "LIVE";
            live.style.cssText = "margin-left:auto;color:#00ffa3;font-size:10px"; link.append(live);
          }
          link.addEventListener("pointerenter", () => selectSearchRow(index));
          return link;
        });
        list.replaceChildren(...searchRows);
        selectSearchRow(selectedHref ? searchRows.findIndex(row => row.href === selectedHref) : -1);
        const pending = responses.some(response => response === null);
        const failed = responses.every(response => response?.status === "rejected");
        message.textContent = searchRows.length ? `${converted} · 스트리머` : pending ? `${converted} · 스트리머 검색 중…` :
          failed ? "검색 연결을 확인해 주세요. 아래 전체 검색도 사용할 수 있습니다." : "일치하는 스트리머가 없습니다.";
      }
      // CORS permits the CHZZK page origin. No cookies, login tokens or new host permission are needed.
      await Promise.allSettled([converted, original].map(async (query, index) => {
        try { responses[index] = { status: "fulfilled", value: await findChannels(query, controller.signal) }; }
        catch { responses[index] = { status: "rejected" }; }
        renderResults();
      }));
      window.clearTimeout(timeout);
    }, 180);
  }
  function selectSearchRow(index) {
    selectedSearchRow = index;
    searchRows.forEach((row, i) => {
      row.setAttribute("aria-selected", String(i === index));
      row.style.background = i === index ? "#2b4938" : "transparent";
    });
  }
  document.addEventListener("input", e => {
    if (e.target.id === "search-input" && !e.isComposing) updateSearch(e.target);
  }, true);
  document.addEventListener("compositionend", e => {
    if (e.target.id === "search-input") updateSearch(e.target);
  }, true);
  document.addEventListener("keydown", event => {
    if (event.target.id !== "search-input") return;
    if (event.isComposing || event.keyCode === 229 || event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.key === "Enter" && selectedSearchRow < 0 && submitConverted(event, event.target)) return;
    if (event.target !== searchInput || searchHint.style.display === "none") return;
    if (event.key === "Escape") { cancelSearch(); return; }
    if (searchRows.length && ["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault(); event.stopImmediatePropagation();
      const next = selectedSearchRow < 0 ? (event.key === "ArrowDown" ? 0 : searchRows.length - 1) :
        selectedSearchRow + (event.key === "ArrowDown" ? 1 : -1);
      selectSearchRow((next + searchRows.length) % searchRows.length);
    } else if (event.key === "Enter" && selectedSearchRow >= 0) {
      event.preventDefault(); event.stopImmediatePropagation();
      location.assign(searchRows[selectedSearchRow].href);
    }
  }, true);
  document.addEventListener("focusin", e => {
    if (e.target.id === "search-input") updateSearch(e.target);
    else if (!searchHint.contains(e.target)) cancelSearch();
  });
  document.addEventListener("pointerdown", e => {
    if (e.target.id !== "search-input" && !searchHint.contains(e.target)) cancelSearch();
  });
  function submitConverted(event, input) {
    if (!input || !settings.koreanSearch || !/^[a-z\s]+$/i.test(input.value.trim())) return false;
    const converted = core.koreanFromEnglish(input.value.trim());
    if (!/[가-힣]/.test(converted)) return false;
    event.preventDefault(); event.stopImmediatePropagation();
    location.assign(`/search?query=${encodeURIComponent(converted)}`);
    return true;
  }
  document.addEventListener("click", event => {
    const button = event.target.closest?.("button[type='submit'], input[type='submit']");
    if (button) submitConverted(event, button.form?.querySelector("#search-input"));
  }, true);
  document.addEventListener("submit", event => {
    submitConverted(event, event.target.querySelector?.("#search-input"));
  }, true);
  chrome.storage.local.get("features").then(data => {
    settings = core.features(data.features);
  }).catch(() => {});
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.features) settings = core.features(changes.features.newValue);
    if (!settings.koreanSearch) cancelSearch();
  });
  window.setInterval(() => {
    if (currentPath === location.pathname) return;
    currentPath = location.pathname; cancelSearch();
  }, 1000);
})();
