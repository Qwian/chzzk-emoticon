(() => {
  if (globalThis.__chzzkChannelTools) return;
  globalThis.__chzzkChannelTools = true;
  const core = globalThis.ChzzkTools, validId = id => /^[a-f0-9]{32}$/i.test(id || "");
  let settings = core.features(), bookmarks = [], pins = [], order = [], ready = false, editing = false;
  let scheduled = 0, stopped = false, dragId = "", playerStatus = "플레이어 대기", edits = Promise.resolve();
  const nativeRows = new Map(), addedRows = new Map(), lists = new Set(), sections = new Set(), decoratedRows = new WeakSet();
  const originalOrders = new Map(), expansionAttempts = new WeakMap(), channelCache = new Map(), followingRefreshes = new WeakMap();
  let publicRequests = 0;
  const style = document.createElement("style");
  style.textContent = `
    .ct-channel-list{display:flex!important;flex-direction:column!important;gap:0!important}
    .ct-channel-row{position:relative!important;order:var(--ct-order,0);min-width:0;list-style:none}
    .ct-native-body{box-sizing:border-box!important;padding-right:28px!important}
    .ct-channel-row.ct-edit .ct-native-body{padding-right:92px!important}
    .ct-row-actions{position:absolute;right:2px;top:6px;z-index:5;display:flex;align-items:center;gap:1px}
    .ct-row-actions button,.ct-list-tools button{border:0;background:transparent;color:inherit;border-radius:5px;cursor:pointer;font:inherit;padding:3px;width:23px;height:26px}
    .ct-row-actions button:hover,.ct-list-tools button:hover{background:#8883}
    .ct-row-actions button:focus-visible,.ct-list-tools button:focus-visible,.ct-bookmark:focus-visible{outline:2px solid #00dc91;outline-offset:1px}
    .ct-row-actions .ct-star{display:grid;place-items:center;color:var(--color-content-03,#92949b);opacity:0;pointer-events:none}
    .ct-channel-row:hover .ct-star,.ct-channel-row:has(:focus-visible) .ct-star{opacity:1;pointer-events:auto}
    .ct-star svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linejoin:round;stroke-linecap:round}
    .ct-star[aria-pressed="true"] svg{fill:currentColor}
    .ct-row-actions .ct-star[aria-pressed="true"]{color:#e6b64e}
    .ct-channel-row:not(.ct-edit) .ct-move{display:none}
    .ct-move:disabled{opacity:.25;cursor:default}
    .ct-list-tools{display:inline-flex;align-items:center;gap:4px;margin-left:auto;font-size:11px;color:inherit}
    .ct-list-tools button{width:auto;white-space:nowrap;padding:3px 5px}
    .ct-list-tools button[aria-pressed="true"]{color:#00c985;background:#00b77e18}
    .ct-channel-divider{order:var(--ct-order);list-style:none!important;border-top:1px solid #8885;margin:7px 10px!important;height:0;padding:0!important}
    .ct-saved-label{font-size:10px;font-weight:600;color:#17b6a0;border:1px solid #17b6a055;border-radius:4px;padding:0 3px;margin-left:5px;white-space:nowrap;vertical-align:middle}
    .ct-saved-link{display:flex;align-items:center;gap:8px;color:inherit;text-decoration:none;min-height:42px;padding:5px 30px 5px 8px;box-sizing:border-box;border-radius:6px}
    .ct-saved-link:hover{background:#8882}.ct-saved-link img{width:26px;height:26px;border-radius:50%;object-fit:cover}
    .ct-saved-link .ct-avatar{width:26px;height:26px;display:grid;place-items:center;border-radius:50%;background:#8883;flex:none}
    .ct-saved-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;min-width:0;flex:1}
    .ct-saved-state{display:flex;align-items:center;gap:5px;font-size:10px;color:var(--color-content-03,#92949b)}
    .ct-saved-category{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
    .ct-saved-viewers{flex:none;margin-left:auto;white-space:nowrap;font-variant-numeric:tabular-nums}
    .ct-saved-viewers[hidden]{display:none}
    .ct-channel-row.ct-edit .ct-saved-link{padding-right:94px}
    .ct-bookmark{display:inline-flex;align-items:center;justify-content:center;gap:5px;flex:none;height:34px;padding:0 13px;border:1px solid #8884;border-radius:20px;background:var(--color-bg-layer-03,#292b30);color:var(--color-content-01,#f5f5f5);font:700 14px system-ui;cursor:pointer;white-space:nowrap;margin-right:8px}
    .ct-bookmark[aria-pressed="true"]{color:#00c985;border-color:#00c98588}.ct-bookmark svg{width:16px;height:16px}
    .ct-fallback-nav{padding:12px 8px;color:inherit}.ct-fallback-nav strong{font-size:13px}.ct-fallback-nav ul{padding:0;margin:8px 0}
    .ct-sidebar-section{container-type:inline-size}
    @container(max-width:110px){.ct-saved-name,.ct-saved-label,.ct-list-tools{display:none}.ct-saved-link{padding-left:3px;gap:0}.ct-native-body{padding-right:18px!important}.ct-row-actions{right:0}.ct-row-actions .ct-star{width:18px}.ct-star svg{width:16px;height:16px}}
  `;
  document.documentElement.append(style);
  const playerHost = document.createElement("span"); playerHost.id = "chzzk-player-tools";
  const playerUi = playerHost.attachShadow({ mode: "open" });
  playerUi.innerHTML = `<style>
    :host{display:inline-flex;position:relative;align-items:center;height:100%;color:inherit;font:12px system-ui;vertical-align:middle}
    details{position:relative}summary{display:flex;align-items:center;gap:5px;cursor:pointer;list-style:none;padding:8px;color:inherit;white-space:nowrap;font-weight:600;opacity:.35;transition:opacity .15s}summary::-webkit-details-marker{display:none}summary:hover,summary:focus-visible{color:#00efa4;opacity:1}
    summary svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8}
    section{position:absolute;right:0;bottom:42px;width:255px;box-sizing:border-box;padding:14px;background:#1d2026f5;border:1px solid #ffffff2b;border-radius:10px;color:#f3f5f7;box-shadow:0 8px 26px #0005;line-height:1.5;z-index:100}
    label{display:flex;gap:8px;align-items:center;font-weight:600}input{accent-color:#00dc91}button{border:0;border-radius:6px;background:#00dc91;color:#07231a;padding:7px 12px;font:700 12px system-ui;cursor:pointer;margin-top:10px}button:disabled{opacity:.4;cursor:default}p{font-size:11px;color:#b5bbc6;margin:10px 0 0}
  </style><details><summary aria-label="실시간 따라잡기 설정"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5M12 7v5l3 2"/></svg>따라잡기</summary><section>
    <label><input id="catch-up" type="checkbox">자동 실시간 따라잡기</label>
    <button id="catch-now" type="button">지금 따라잡기</button><p id="player-status" role="status"></p>
  </section></details>`;
  const $ = selector => playerUi.querySelector(selector);
  // Mouse clicks still toggle details, without retaining focus in the player's controls.
  $("summary").addEventListener("pointerdown", event => {
    if (event.button === 0 && event.pointerType === "mouse") event.preventDefault();
  });
  const bookmarkButton = document.createElement("button");
  bookmarkButton.type = "button"; bookmarkButton.id = "chzzk-channel-save"; bookmarkButton.className = "ct-bookmark";
  bookmarkButton.innerHTML = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M5 3h10v14l-5-3-5 3z"/></svg><span></span>';
  const divider = document.createElement("li"); divider.className = "ct-channel-divider"; divider.setAttribute("role", "separator"); divider.setAttribute("aria-label", "즐겨찾기와 일반 채널 구분");
  let tools = null, fallbackNav = null;
  function showError() { $("#player-status").textContent = "저장하지 못했습니다. 페이지를 새로고침해 주세요."; bookmarkButton.title = "저장하지 못했습니다. 페이지를 새로고침해 주세요."; }
  function update(key, transform) {
    const operation = edits.then(async () => {
      const data = await chrome.storage.local.get(key);
      const value = transform(data[key]); await chrome.storage.local.set({ [key]: value });
      applyStorage({ [key]: value });
    });
    edits = operation.catch(showError); return edits;
  }
  function text(element, value) { if (element.textContent !== value) element.textContent = value; }
  function channelId(link) { try { const url = new URL(link.href, location.href); return url.origin === location.origin ? core.channelId(url.pathname) : ""; } catch { return ""; } }
  function readName(link, row) {
    const name = row?.querySelector('[class*="_name_"], [data-channel-name]');
    const copy = name?.cloneNode(true); copy?.querySelectorAll(".ct-saved-label").forEach(node => node.remove());
    return (name?.getAttribute("data-channel-name") || copy?.textContent || link?.getAttribute("aria-label") || link?.textContent || row?.querySelector("img")?.alt || "").trim().slice(0, 80);
  }
  function currentChannel() {
    const id = core.channelId(location.pathname); if (!id) return null;
    const links = [...document.querySelectorAll("main a[href]")].filter(a => channelId(a) === id);
    const link = links.find(a => a.textContent.trim() && !/라이브|LIVE|팔로워/.test(a.textContent)) || links[0];
    const name = readName(link, link) || document.title.split(" - ")[0].slice(0, 80) || id;
    const image = link?.querySelector("img")?.src || bookmarks.find(row => row.id === id)?.image || "";
    return { id, name, image: image.startsWith("https://") ? image : "" };
  }
  function queryDeep(selector) {
    const roots = [document];
    for (let i = 0; i < roots.length; i++) {
      const found = roots[i].querySelector(selector); if (found) return found;
      roots[i].querySelectorAll("*").forEach(node => { if (node.shadowRoot && node !== playerHost) roots.push(node.shadowRoot); });
    }
    return null;
  }
  function placeControls() {
    const clip = /^\/live\/[a-f0-9]{32}\/?$/i.test(location.pathname) ? queryDeep(".custom__clip-button, button[aria-label='클립 만들기']") : null;
    if (clip?.parentElement && clip.previousElementSibling !== playerHost) clip.before(playerHost);
    if (!clip) playerHost.remove();
    $("#catch-up").checked = settings.catchUp; $("#catch-now").disabled = !settings.catchUp;
    text($("#player-status"), playerStatus);
    const channel = currentChannel();
    const follow = channel && settings.favorites ? [...document.querySelectorAll("main button")].find(button =>
      button !== bookmarkButton && !button.closest("nav") && /^(팔로우|팔로잉|Follow)/i.test(button.textContent.trim())) : null;
    if (!follow) { bookmarkButton.remove(); return; }
    const anchor = follow.closest('[class*="_button_alone_"], [class*="_has_tooltip_box_"]') || follow;
    if (anchor.previousElementSibling !== bookmarkButton) anchor.before(bookmarkButton);
    const saved = bookmarks.some(row => row.id === channel.id);
    text(bookmarkButton.querySelector("span"), saved ? "보관됨" : "보관");
    bookmarkButton.setAttribute("aria-pressed", String(saved));
    bookmarkButton.title = saved ? "보관 채널 해제 · 팔로우 상태는 유지" : "팔로우 없이 보관하고 사이드바에서 보기";
  }
  bookmarkButton.addEventListener("click", event => {
    event.preventDefault(); event.stopPropagation(); const channel = currentChannel(); if (!channel) return;
    update("favorites", value => {
      const rows = Array.isArray(value) ? value : [];
      return rows.some(row => row?.id === channel.id) ? rows.filter(row => row?.id !== channel.id) : [...rows, channel];
    });
  });
  $("#catch-up").addEventListener("change", () => update("features", value => ({ ...value, catchUp: $("#catch-up").checked })));
  $("#catch-now").addEventListener("click", () => document.dispatchEvent(new CustomEvent("chzzk-tools:catch-up")));
  document.addEventListener("chzzk-tools:player-status", event => { playerStatus = String(event.detail?.text || "").slice(0, 180); text($("#player-status"), playerStatus); });
  function followingSection() {
    return [...document.querySelectorAll("nav[aria-label]")].find(nav => !nav.classList.contains("ct-fallback-nav") && /^(팔로우|팔로잉|Following)$/i.test(nav.getAttribute("aria-label")));
  }
  function expand(section) {
    if (!settings.followingExpanded) return;
    for (const button of section.querySelectorAll('button[aria-expanded]')) {
      if (button.getAttribute("aria-expanded") === "true") { expansionAttempts.delete(button); continue; }
      const label = `${button.getAttribute("aria-label") || ""} ${button.textContent}`;
      if (!/펼치|더보기|더 보기|expand|more/i.test(label) || button.closest(".ct-list-tools,.ct-row-actions")) continue;
      const previous = expansionAttempts.get(button) || { time: 0, count: 0 };
      if (previous.count >= 3 || Date.now() - previous.time < 1500) continue;
      expansionAttempts.set(button, { time: Date.now(), count: previous.count + 1 }); button.click();
    }
  }
  function makeTools(section) {
    if (!tools) {
      tools = document.createElement("span"); tools.className = "ct-list-tools";
      const edit = document.createElement("button"); edit.type = "button"; edit.textContent = "순서"; edit.title = "즐겨찾기와 일반 채널의 순서 편집";
      edit.addEventListener("click", () => { editing = !editing; schedule(); }); tools.append(edit);
    }
    const header = section.querySelector(':scope > div:has(> strong), :scope > header, :scope > strong');
    const parent = header?.tagName === "STRONG" ? header.parentElement : header;
    if (parent && tools.parentElement !== parent) parent.append(tools);
    tools.firstElementChild.setAttribute("aria-pressed", String(editing));
    text(tools.firstElementChild, editing ? "완료" : "순서");
  }
  function setRank(row, rank) {
    if (!originalOrders.has(row)) originalOrders.set(row, row.style.getPropertyValue("--ct-order"));
    const value = String(rank); if (row.style.getPropertyValue("--ct-order") !== value) row.style.setProperty("--ct-order", value);
  }
  function move(id, target, after = false) {
    if (id === target || groupOf(id) !== groupOf(target)) return;
    const visible = core.orderChannels([...nativeRows.values(), ...addedRows.values()], pins, order).map(row => row.id);
    update("channelOrder", value => {
      const ids = [...new Set([...(Array.isArray(value) ? value : []), ...visible])].filter(x => x !== id);
      const index = ids.indexOf(target); if (index >= 0) ids.splice(index + (after ? 1 : 0), 0, id);
      return ids;
    });
  }
  function groupOf(id) { const item = nativeRows.get(id) || addedRows.get(id); return item ? core.channelGroup(item, pins) : -1; }
  function decorate(item, sorted) {
    const row = item.row; row.classList.add("ct-channel-row"); row.classList.toggle("ct-edit", editing);
    if (!decoratedRows.has(row)) { row.querySelector(":scope > .ct-row-actions")?.remove(); decoratedRows.add(row); }
    if (!row.querySelector(":scope > .ct-row-actions")) {
      const actions = document.createElement("span"); actions.className = "ct-row-actions";
      for (const [label, direction] of [["위로", -1], ["아래로", 1]]) {
        const button = document.createElement("button"); button.type = "button"; button.className = "ct-move";
        button.textContent = direction < 0 ? "↑" : "↓"; button.setAttribute("aria-label", `${item.name} ${label}`);
        button.addEventListener("click", event => {
          event.preventDefault(); event.stopPropagation(); const group = core.orderChannels([...nativeRows.values(), ...addedRows.values()], pins, order).filter(other => groupOf(other.id) === groupOf(item.id));
          const target = group[group.findIndex(other => other.id === item.id) + direction]; if (target) move(item.id, target.id, direction > 0);
        }); actions.append(button);
      }
      const grip = document.createElement("button"); grip.type = "button"; grip.className = "ct-move ct-drag"; grip.textContent = "⠿"; grip.draggable = true; grip.setAttribute("aria-label", `${item.name} 순서 드래그`);
      grip.addEventListener("dragstart", event => { dragId = item.id; event.dataTransfer.setData("application/x-chzzk-tools-channel", item.id); event.dataTransfer.effectAllowed = "move"; event.stopPropagation(); });
      grip.addEventListener("dragend", () => { dragId = ""; }); actions.append(grip);
      const star = document.createElement("button"); star.type = "button"; star.className = "ct-star";
      star.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3.5 2.65 5.37 5.93.86-4.29 4.18 1.01 5.9L12 17.03 6.7 19.8l1.01-5.9-4.29-4.18 5.93-.86Z"/></svg>';
      star.addEventListener("click", event => {
        event.preventDefault(); event.stopPropagation(); update("followingFavorites", value => {
          const ids = Array.isArray(value) ? value : []; return ids.includes(item.id) ? ids.filter(id => id !== item.id) : [...ids, item.id];
        });
      }); actions.append(star); row.append(actions);
      row.addEventListener("dragover", event => { if (editing && dragId && groupOf(dragId) === groupOf(item.id)) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } });
      row.addEventListener("drop", event => { if (editing && dragId) { event.preventDefault(); event.stopPropagation(); move(dragId, item.id); dragId = ""; } });
    }
    const star = row.querySelector(".ct-star"), pinned = pins.includes(item.id);
    star.setAttribute("aria-pressed", String(pinned));
    star.title = `${item.name} 즐겨찾기 ${pinned ? "해제" : "등록"}`; star.setAttribute("aria-label", star.title);
    const group = sorted.filter(other => groupOf(other.id) === groupOf(item.id)), index = group.findIndex(other => other.id === item.id);
    row.querySelectorAll(".ct-move:not(.ct-drag)").forEach((button, i) => { button.disabled = i === 0 ? index === 0 : index === group.length - 1; });
  }
  function savedRow(channel) {
    let item = addedRows.get(channel.id);
    if (!item) {
      const row = document.createElement("li"), link = document.createElement("a"); link.className = "ct-saved-link";
      link.addEventListener("click", event => {
        if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
        const url = new URL(link.href, location.href);
        if (url.origin !== location.origin || !core.channelId(url.pathname)) return;
        event.preventDefault();
        if (url.href === location.href) return;
        const previous = history.state;
        const state = { usr: null, key: crypto.randomUUID().slice(0, 8), idx: Number.isInteger(previous?.idx) ? previous.idx + 1 : 1 };
        history.pushState(state, "", url.pathname + url.search + url.hash);
        window.dispatchEvent(new PopStateEvent("popstate", { state }));
      });
      const avatar = document.createElement("span"); avatar.className = "ct-avatar"; avatar.textContent = channel.name[0] || "□";
      const name = document.createElement("span"); name.className = "ct-saved-name";
      const title = document.createElement("span"), badge = document.createElement("span"), state = document.createElement("small");
      const category = document.createElement("span"), viewers = document.createElement("span");
      category.className = "ct-saved-category"; viewers.className = "ct-saved-viewers"; state.append(category, viewers);
      badge.className = "ct-saved-label"; badge.textContent = "보관"; state.className = "ct-saved-state";
      name.append(title, badge, state); link.append(avatar, name); row.append(link); item = { id: channel.id, name: channel.name, row, link, avatar, title, state, category, viewers }; addedRows.set(channel.id, item);
    }
    const data = channelCache.get(channel.id)?.data || channel;
    item.followed = false; item.openLive = data.openLive === true;
    item.name = data.name || channel.name; text(item.title, item.name); item.link.href = data.openLive ? `/live/${channel.id}` : `/${channel.id}`;
    text(item.category, data.openLive === true ? ["LIVE", data.category].filter(Boolean).join(" · ") : data.openLive === false ? "오프라인" : "팔로우 없이 보관");
    item.viewers.hidden = !data.openLive || !Number.isFinite(data.viewers);
    text(item.viewers, Number.isFinite(data.viewers) ? `${data.viewers.toLocaleString("ko-KR")}명` : "");
    item.link.title = [data.title, data.category].filter(Boolean).join("\n");
    const image = data.image || channel.image;
    if (typeof image === "string" && image.startsWith("https://") && item.avatar.dataset.image !== image) {
      const img = document.createElement("img"); img.src = image; img.alt = ""; item.avatar.replaceChildren(img); item.avatar.dataset.image = image;
    }
    return item;
  }
  function refreshChannel(channel) {
    if (document.hidden || publicRequests >= 3 || channelCache.get(channel.id)?.time > Date.now() - 30000) return;
    channelCache.set(channel.id, { ...channelCache.get(channel.id), time: Date.now() }); publicRequests++;
    globalThis.ChzzkChannels.get(channel.id).then(data => {
      channelCache.set(channel.id, { time: Date.now(), data });
    }).catch(() => { const previous = channelCache.get(channel.id); if (previous) previous.time = Date.now() - 20000; })
      .finally(() => { publicRequests--; schedule(); });
  }
  function renderSidebar() {
    for (const list of lists) if (!list.isConnected) lists.delete(list);
    for (const section of sections) if (!section.isConnected) sections.delete(section);
    for (const row of originalOrders.keys()) if (!row.isConnected) originalOrders.delete(row);
    let section = followingSection();
    if (section) {
      fallbackNav?.remove(); expand(section);
      const now = Date.now(), last = followingRefreshes.get(section);
      if (last === undefined) followingRefreshes.set(section, now);
      else if (settings.followingRefresh && !document.hidden && now - last >= 30000) {
        const refresh = [...section.querySelectorAll("button[aria-label]")].find(button =>
          !button.disabled && !button.closest(".ct-list-tools,.ct-row-actions") && /새로\s*고침|refresh/i.test(button.getAttribute("aria-label")));
        if (refresh) { followingRefreshes.set(section, now); refresh.click(); }
      }
    }
    if (!section && settings.favorites && bookmarks.length) {
      const header = document.querySelector("#sidebar") || document.querySelector("#header");
      if (header) {
        if (!fallbackNav) { fallbackNav = document.createElement("nav"); fallbackNav.className = "ct-fallback-nav"; fallbackNav.setAttribute("aria-label", "보관 채널"); fallbackNav.innerHTML = "<div><strong>보관 채널</strong></div><ul></ul>"; }
        const sibling = header.querySelector("nav[aria-label]");
        if (!fallbackNav.isConnected) {
          const menu = sibling || header.querySelector("ul");
          if (menu) menu.after(fallbackNav); else header.append(fallbackNav);
        }
        section = fallbackNav;
      }
    } else if (!section) fallbackNav?.remove();
    if (!section) return;
    sections.add(section); section.classList.add("ct-sidebar-section"); makeTools(section);
    const list = section.querySelector("ul"); if (!list) return;
    lists.add(list); list.classList.add("ct-channel-list"); nativeRows.clear();
    for (const link of list.querySelectorAll("a[href]")) {
      if (link.classList.contains("ct-saved-link")) continue;
      const id = channelId(link), row = link.closest("li");
      if (!id || !row || row.parentElement !== list || nativeRows.has(id)) continue;
      const name = readName(link, row) || id;
      const openLive = new URL(link.href, location.href).pathname.startsWith("/live/");
      nativeRows.set(id, { id, name, row, followed: true, openLive });
      link.parentElement.classList.add("ct-native-body");
      const saved = settings.favorites && bookmarks.some(channel => channel.id === id);
      let badge = row.querySelector(".ct-native-saved-label");
      if (saved && !badge) { badge = document.createElement("span"); badge.className = "ct-saved-label ct-native-saved-label"; badge.textContent = "보관"; (row.querySelector('[class*="_name_"], [data-channel-name]') || link.parentElement).append(badge); }
      if (!saved) badge?.remove();
    }
    const savedIds = new Set(settings.favorites ? bookmarks.map(channel => channel.id) : []);
    for (const [id, item] of addedRows) if (!savedIds.has(id) || nativeRows.has(id)) { item.row.remove(); addedRows.delete(id); }
    if (settings.favorites) for (const channel of bookmarks) if (!nativeRows.has(channel.id)) {
      const item = savedRow(channel); if (item.row.parentElement !== list) list.append(item.row); refreshChannel(channel);
    }
    const sorted = core.orderChannels([...nativeRows.values(), ...addedRows.values()], pins, order);
    sorted.forEach((item, i) => { setRank(item.row, i * 2); decorate(item, sorted); });
    const count = sorted.filter(item => pins.includes(item.id)).length;
    if (count && count < sorted.length) { setRank(divider, count * 2 - 1); if (divider.parentElement !== list) list.append(divider); } else divider.remove();
  }
  function render() { if (!ready || stopped) return; placeControls(); renderSidebar(); }
  function schedule() { if (!scheduled && !stopped) scheduled = setTimeout(() => { scheduled = 0; render(); }, 100); }
  function applyStorage(data) {
    if (Object.hasOwn(data, "features")) settings = core.features(data.features);
    if (Object.hasOwn(data, "favorites")) bookmarks = (Array.isArray(data.favorites) ? data.favorites : []).filter(row => validId(row?.id) && typeof row.name === "string");
    if (Object.hasOwn(data, "followingFavorites")) pins = (Array.isArray(data.followingFavorites) ? data.followingFavorites : []).filter(validId);
    if (Object.hasOwn(data, "channelOrder")) order = (Array.isArray(data.channelOrder) ? data.channelOrder : []).filter(validId);
    schedule();
  }
  chrome.storage.local.get(["features", "favorites", "followingFavorites", "channelOrder"]).then(data => { applyStorage(data); ready = true; render(); }).catch(showError);
  chrome.storage.onChanged.addListener((changes, area) => { if (area === "local") applyStorage(Object.fromEntries(Object.entries(changes).map(([key, change]) => [key, change.newValue]))); });
  const observer = new MutationObserver(records => {
    if (records.some(record => {
      const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      if (target?.closest(".ct-row-actions,.ct-list-tools,.ct-saved-link,.ct-channel-divider,.ct-saved-label,[class*='chatting'],[contenteditable]")) return false;
      if (target?.closest("nav[aria-label]")) return true;
      return [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 &&
        (node.matches("main,#header,nav[aria-label],.custom__clip-button") || node.querySelector(".custom__clip-button,nav[aria-label]")));
    })) schedule();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  const timer = setInterval(schedule, 1500);
  window.addEventListener("pagehide", event => {
    if (event.persisted) return;
    stopped = true; clearInterval(timer); clearTimeout(scheduled); observer.disconnect(); playerHost.remove(); bookmarkButton.remove(); tools?.remove(); divider.remove(); fallbackNav?.remove();
    addedRows.forEach(item => item.row.remove());
    lists.forEach(list => list.classList.remove("ct-channel-list")); sections.forEach(section => section.classList.remove("ct-sidebar-section"));
    originalOrders.forEach((value, row) => { if (value) row.style.setProperty("--ct-order", value); else row.style.removeProperty("--ct-order"); });
    document.querySelectorAll(".ct-row-actions,.ct-native-saved-label").forEach(node => node.remove());
    document.querySelectorAll(".ct-channel-row,.ct-native-body").forEach(node => node.classList.remove("ct-channel-row", "ct-native-body", "ct-edit")); style.remove();
  });
})();
