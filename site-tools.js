(() => {
  if (globalThis.__chzzkSiteTools) return;
  globalThis.__chzzkSiteTools = true;
  const core = globalThis.ChzzkTools;
  let settings = core.features(), favorites = [], currentPath = location.pathname, playerStatus = "플레이어 대기";
  const host = document.createElement("div");
  host.id = "chzzk-tools-panel";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `<style>
    :host{position:fixed;bottom:16px;left:16px;z-index:10000;font:12px/1.6 system-ui;color:#eef5f1}
    details{background:#111b17f5;border:1px solid #43554b;border-radius:10px;box-shadow:0 3px 16px #0004}
    summary{cursor:pointer;padding:8px 12px;color:#00ffa3;font-weight:700}
    section{width:260px;padding:0 12px 12px;max-height:50vh;overflow:auto}
    button,a{color:#dcebe3;background:#24372c;border:1px solid #4d6356;border-radius:6px;padding:4px 8px;cursor:pointer;font:inherit;text-decoration:none}
    button:disabled{opacity:.5;cursor:default} p{margin:8px 0;color:#b5cbbf}
    ul{list-style:none;padding:0;margin:8px 0}li{display:flex;gap:8px;margin-top:6px}li a{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    label{display:block;margin:8px 0}input{accent-color:#00ffa3} #notice{color:#ffd787}
  </style><details><summary>치지직 도구 · 즐겨찾기</summary><section>
    <p id="player-status" role="status"></p>
    <label><input id="catch-up" type="checkbox"> 자동 실시간 따라잡기</label>
    <button id="catch-now" type="button">지금 따라잡기</button>
    <p>치즈 플래터의 실시간 따라잡기는 끄고 사용하세요.</p>
    <div id="favorites"><button id="favorite-add" type="button">현재 채널 즐겨찾기</button><ul></ul></div>
    <p id="notice" role="status"></p>
  </section></details>`;
  document.documentElement.append(host);
  const $ = selector => shadow.querySelector(selector);
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

  async function saveFavorites(next) {
    // Read immediately before changing the list, keeping edits from other open tabs.
    const data = await chrome.storage.local.get("favorites");
    const current = Array.isArray(data.favorites) ? data.favorites : [];
    favorites = next(current);
    await chrome.storage.local.set({ favorites });
    render();
  }
  function channelName(id) {
    const links = [...document.querySelectorAll("a[href]")].filter(a => {
      const url = new URL(a.href, location.href);
      return url.origin === location.origin && core.channelId(url.pathname) === id;
    });
    const named = links.map(a => a.getAttribute("aria-label") || a.textContent.trim() || a.querySelector("img")?.alt || "")
      .find(name => name && !/라이브 엔드로 이동|LIVE|팔로워/.test(name));
    return (named || document.title.split(" - ")[0] || id).replace(/\s*채널로 이동$/, "").slice(0, 80);
  }
  function render() {
    host.hidden = !settings.favorites && !/^\/live\//.test(location.pathname);
    $("#catch-up").checked = settings.catchUp;
    $("#catch-now").disabled = !settings.catchUp || !/^\/live\//.test(location.pathname);
    $("#favorites").hidden = !settings.favorites;
    const id = core.channelId(location.pathname);
    $("#favorite-add").disabled = !id || favorites.some(item => item.id === id);
    $("#favorite-add").textContent = favorites.some(item => item.id === id) ? "즐겨찾기에 등록됨" : "현재 채널 즐겨찾기";
    $("ul").replaceChildren(...favorites.map(item => {
      const li = document.createElement("li"), a = document.createElement("a"), remove = document.createElement("button");
      a.href = `/live/${item.id}`; a.textContent = item.name;
      remove.type = "button"; remove.textContent = "×"; remove.title = `${item.name} 즐겨찾기 해제`;
      remove.addEventListener("click", () => saveFavorites(current => current.filter(row => row.id !== item.id)).catch(showError));
      li.append(a, remove); return li;
    }));
    $("#player-status").textContent = playerStatus;
  }
  function showError() { $("#notice").textContent = "저장하지 못했습니다. 잠시 후 다시 시도하세요."; }
  $("#favorite-add").addEventListener("click", () => {
    const id = core.channelId(location.pathname);
    if (!id) return;
    const name = channelName(id);
    saveFavorites(current => current.some(item => item.id === id) ? current : [...current, { id, name }]).catch(showError);
  });
  $("#catch-up").addEventListener("change", async () => {
    try {
      const data = await chrome.storage.local.get("features");
      settings = core.features({ ...data.features, catchUp: $("#catch-up").checked });
      await chrome.storage.local.set({ features: settings });
    } catch { showError(); }
  });
  $("#catch-now").addEventListener("click", () => document.dispatchEvent(new CustomEvent("chzzk-tools:catch-up")));
  document.addEventListener("chzzk-tools:player-status", event => {
    playerStatus = String(event.detail?.text || ""); $("#player-status").textContent = playerStatus;
  });

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
      // CORS permits the CHZZK page origin. No cookies, login tokens or new host permission are needed.
      const responses = await Promise.allSettled([converted, original].map(query => findChannels(query, controller.signal)));
      window.clearTimeout(timeout);
      if (generation !== searchGeneration || input.value.trim() !== original || !settings.koreanSearch) return;
      const channels = new Map();
      for (const response of responses) if (response.status === "fulfilled") {
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
        const name = document.createElement("span");
        name.textContent = channel.channelName;
        link.append(name);
        if (channel.openLive) {
          const live = document.createElement("span"); live.textContent = "LIVE";
          live.style.cssText = "margin-left:auto;color:#00ffa3;font-size:10px"; link.append(live);
        }
        link.addEventListener("pointerenter", () => selectSearchRow(index));
        return link;
      });
      list.replaceChildren(...searchRows);
      const failed = responses.every(response => response.status === "rejected");
      message.textContent = searchRows.length ? `${converted} · 스트리머` :
        failed ? "검색 연결을 확인해 주세요. 아래 전체 검색도 사용할 수 있습니다." : "일치하는 스트리머가 없습니다.";
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
    if (event.target !== searchInput || searchHint.style.display === "none") return;
    if (event.isComposing || event.keyCode === 229 || event.ctrlKey || event.altKey || event.metaKey) return;
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
  document.addEventListener("submit", event => {
    const input = event.target.querySelector?.("#search-input");
    if (!input || !settings.koreanSearch || !/^[a-z\s]+$/i.test(input.value.trim())) return;
    const converted = core.koreanFromEnglish(input.value.trim());
    if (!/[가-힣]/.test(converted)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    location.assign(`/search?query=${encodeURIComponent(converted)}`);
  }, true);
  chrome.storage.local.get(["features", "favorites"]).then(data => {
    settings = core.features(data.features);
    favorites = (Array.isArray(data.favorites) ? data.favorites : []).filter(row => /^[a-f0-9]{32}$/.test(row?.id) && typeof row.name === "string");
    render();
  }).catch(showError);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.features) settings = core.features(changes.features.newValue);
    if (!settings.koreanSearch) cancelSearch();
    if (changes.favorites) favorites = (changes.favorites.newValue || []).filter(row => /^[a-f0-9]{32}$/.test(row?.id) && typeof row.name === "string");
    render();
  });
  window.setInterval(() => {
    if (currentPath === location.pathname) return;
    currentPath = location.pathname; cancelSearch(); render();
  }, 1000);
})();
