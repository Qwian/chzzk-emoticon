(() => {
  if (globalThis.__chzzkSiteTools) return;
  globalThis.__chzzkSiteTools = true;
  const core = globalThis.ChzzkTools;
  let settings = core.features(), favorites = [], currentPath = "", playerStatus = "플레이어 대기";
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
    if (!settings.koreanSearch || input.id !== "search-input" || !input.value.trim() || input.value.length > 100) {
      searchHint.style.display = "none"; return;
    }
    const original = input.value.trim(), converted = core.koreanFromEnglish(original);
    if (converted === original || !/[가-힣]/.test(converted) || !/[a-z]/i.test(original)) { searchHint.style.display = "none"; return; }
    const rect = input.getBoundingClientRect();
    searchHint.replaceChildren(searchLink(`${converted} 검색`, converted), searchLink("영문 그대로 검색", original));
    searchHint.style.left = `${Math.max(4, rect.left)}px`;
    searchHint.style.top = `${rect.bottom + 6}px`;
    searchHint.style.display = "block";
  }
  document.addEventListener("input", e => {
    if (e.target.id === "search-input") updateSearch(e.target);
  }, true);
  document.addEventListener("focusin", e => {
    if (e.target.id === "search-input") updateSearch(e.target);
    else if (!searchHint.contains(e.target)) searchHint.style.display = "none";
  });
  document.addEventListener("pointerdown", e => {
    if (e.target.id !== "search-input" && !searchHint.contains(e.target)) searchHint.style.display = "none";
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
    if (changes.favorites) favorites = (changes.favorites.newValue || []).filter(row => /^[a-f0-9]{32}$/.test(row?.id) && typeof row.name === "string");
    render();
  });
  window.setInterval(() => {
    if (currentPath === location.pathname) return;
    currentPath = location.pathname; searchHint.style.display = "none"; render();
  }, 1000);
})();
