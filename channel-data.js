// Shared public metadata only. Playback URLs and account fields are not cached here.
(() => {
  if (globalThis.ChzzkChannels) return;
  const entries = new Map(), queue = [];
  let running = 0;
  const abortError = () => new DOMException("Channel request aborted", "AbortError");
  async function json(url, signal) {
    const response = await fetch(url, { credentials: "omit", signal });
    if (!response.ok) throw new Error("Channel metadata unavailable");
    const body = await response.json();
    if (body.code !== 200) throw new Error("Channel metadata unavailable");
    return body.content;
  }
  async function load(id, signal) {
    const profile = await json(`https://api.chzzk.naver.com/service/v1/channels/${id}`, signal);
    if (profile?.channelId !== id) throw new Error("Channel mismatch");
    const data = { id, name: String(profile.channelName || id).slice(0, 80), image: profile.channelImageUrl,
      openLive: profile.openLive === true, liveId: null, title: "", category: "", viewers: null };
    if (!data.openLive) return data;
    const live = await json(`https://api.chzzk.naver.com/service/v2/channels/${id}/live-detail`, signal);
    if (!live || live.channel?.channelId !== id) throw new Error("Live channel mismatch");
    data.openLive = live.status === "OPEN" && !live.closeDate;
    if (!data.openLive) return data;
    data.liveId = Number.isSafeInteger(live.liveId) && live.liveId > 0 ? live.liveId : null;
    data.title = String(live.liveTitle || "").slice(0, 180);
    data.category = String(live.liveCategoryValue || "").slice(0, 80);
    data.viewers = live.cvExposure === true && Number.isFinite(live.concurrentUserCount) ? Math.max(0, Math.trunc(live.concurrentUserCount)) : null;
    return data;
  }
  function pump() {
    while (running < 3 && queue.length) {
      const work = queue.shift();
      if (!work.waiters.size) { if (entries.get(work.id)?.work === work) entries.delete(work.id); continue; }
      work.started = true; running++;
      const timeout = setTimeout(() => work.controller.abort(), 8000);
      load(work.id, work.controller.signal).then(data => {
        entries.set(work.id, { data, time: Date.now() });
        [...work.waiters].forEach(waiter => waiter.finish(null, data));
        if (entries.size > 128) for (const [id, entry] of entries) {
          if (!entry.work && id !== work.id) { entries.delete(id); break; }
        }
      }, error => {
        if (entries.get(work.id)?.work === work) entries.delete(work.id);
        [...work.waiters].forEach(waiter => waiter.finish(error));
      }).finally(() => { clearTimeout(timeout); running--; pump(); });
    }
  }
  function get(id, { signal } = {}) {
    if (!/^[a-f0-9]{32}$/i.test(id || "")) return Promise.reject(new Error("Invalid channel"));
    if (signal?.aborted) return Promise.reject(abortError());
    const existing = entries.get(id);
    if (existing?.data && Date.now() - existing.time < 30000) return Promise.resolve(existing.data);
    let work = existing?.work;
    if (!work || work.controller.signal.aborted) {
      work = { id, controller: new AbortController(), waiters: new Set(), started: false };
      entries.set(id, { work }); if (signal) queue.unshift(work); else queue.push(work);
    }
    return new Promise((resolve, reject) => {
      const waiter = { finish(error, data) {
        if (!work.waiters.delete(waiter)) return;
        signal?.removeEventListener("abort", cancel);
        if (error) reject(error); else resolve(data);
      } };
      const cancel = () => {
        waiter.finish(abortError());
        if (!work.waiters.size) work.controller.abort();
      };
      work.waiters.add(waiter); signal?.addEventListener("abort", cancel, { once: true });
      pump();
    });
  }
  globalThis.ChzzkChannels = Object.freeze({ get });
})();
