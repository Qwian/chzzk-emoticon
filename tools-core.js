(() => {
  const defaults = Object.freeze({
    koreanSearch: true, favorites: true, catchUp: true, catchUpMode: "stable", followingExpanded: true, followingRefresh: true,
    adMute: true, adSpeed: 4, adMini: true, mainAudio: true, adAutoSkip: true, adblockQuality: true,
    globalSpeed: true, playerShortcuts: true, channelLiveLink: true, listPreview: true, sidebarPreview: true, freeChat: true, youtubeWide: true, nexonWide: true, highestQuality: true, dismissAdNotice: true
  });
  const initials = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
  const vowels = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";
  const finals = " ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ";
  const keys = Object.fromEntries([..."rRseEfaqQtTdwWczxvgkoiOjpuPhynbml"].map((k, i) =>
    [k, [..."ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎㅏㅐㅑㅒㅓㅔㅕㅖㅗㅛㅜㅠㅡㅣ"][i]]));
  const joins = {"ㅗㅏ":"ㅘ", "ㅗㅐ":"ㅙ", "ㅗㅣ":"ㅚ", "ㅜㅓ":"ㅝ", "ㅜㅔ":"ㅞ", "ㅜㅣ":"ㅟ", "ㅡㅣ":"ㅢ",
    "ㄱㅅ":"ㄳ", "ㄴㅈ":"ㄵ", "ㄴㅎ":"ㄶ", "ㄹㄱ":"ㄺ", "ㄹㅁ":"ㄻ", "ㄹㅂ":"ㄼ", "ㄹㅅ":"ㄽ", "ㄹㅌ":"ㄾ", "ㄹㅍ":"ㄿ", "ㄹㅎ":"ㅀ", "ㅂㅅ":"ㅄ"};
  const splits = Object.fromEntries(Object.entries(joins).map(([pair, result]) => [result, pair]));

  function koreanFromEnglish(value) {
    let out = "", l = "", v = "", t = "";
    const flush = () => {
      out += l && v ? String.fromCharCode(0xac00 + initials.indexOf(l) * 588 + vowels.indexOf(v) * 28 + (t ? finals.indexOf(t) : 0)) : l + v;
      l = v = t = "";
    };
    for (const char of value) {
      const j = keys[char] || keys[char.toLowerCase()];
      if (!j || !/[a-z]/i.test(char)) { flush(); out += char; continue; }
      if (vowels.includes(j)) {
        if (t) {
          const pair = splits[t];
          const next = pair ? pair[1] : t;
          t = pair ? pair[0] : "";
          flush(); l = next; v = j;
        } else if (v && joins[v + j]) v = joins[v + j];
        else if (v) { flush(); v = j; }
        else v = j;
      } else if (l && v && !t && finals.includes(j)) t = j;
      else if (t && joins[t + j]) t = joins[t + j];
      else { flush(); l = j; }
    }
    flush();
    return out;
  }

  function features(value) {
    const next = { ...defaults, ...value };
    next.adSpeed = [1, 2, 4, 8, 16].includes(Number(next.adSpeed)) ? Number(next.adSpeed) : 4;
    next.catchUpMode = next.catchUpMode === "lowLatency" ? "lowLatency" : "stable";
    return next;
  }

  const catchUpProfiles = Object.freeze({
    stable: Object.freeze({ initialMargin: 1.5, minMargin: 0.75, maxMargin: 1.5, waitingStep: 0.25,
      startDelay: 0, recoveryDelay: 2000, adDelay: 750, seekCooldown: 750,
      seekInterval: 3000, seekGap: 0.75, forceSeekGap: 0.35, stopGap: 0.15,
      fastGap: 0.75, fastRate: 1.08, slowRate: 1.03, stableInterval: 60000, marginStep: 0.25, eventDriven: true }),
    lowLatency: Object.freeze({ initialMargin: 0.35, minMargin: 0.35, maxMargin: 0.75, waitingStep: 0.25,
      startDelay: 0, recoveryDelay: 2000, adDelay: 750, seekCooldown: 750,
      seekInterval: 2000, seekGap: 1, forceSeekGap: 0.1, stopGap: 0.1,
      fastGap: 0.5, fastRate: 1.15, slowRate: 1.05, stableInterval: 10000, marginStep: 0.1, eventDriven: true })
  });
  function catchUpProfile(mode) { return catchUpProfiles[mode === "lowLatency" ? "lowLatency" : "stable"]; }

  function planCatchUp({ time, seekable, buffered, margin, lastSeek, now, force = false, mode = "stable" }) {
    const profile = catchUpProfile(mode);
    // Recovery must not turn several seconds of accumulated latency into the target.
    margin = Math.min(profile.maxMargin, Math.max(profile.minMargin, Number.isFinite(margin) ? margin : profile.initialMargin));
    if (!Number.isFinite(time) || !seekable.length) return { rate: 1, reason: "재생 범위 대기" };
    const latest = seekable[seekable.length - 1];
    const buffer = buffered.find(([start, end]) => start <= time + 0.05 && end >= time);
    if (!buffer) return { rate: 1, reason: "버퍼 대기" };
    // Seeking is limited to the latest *buffered* range intersecting the live range.
    const fresh = buffered[buffered.length - 1];
    const edge = Math.min(latest[1], fresh[1]);
    const target = edge - margin;
    const gap = edge - time;
    const ahead = buffer[1] - time;
    if (target >= Math.max(latest[0], fresh[0]) && target > time + (force ? profile.forceSeekGap : profile.seekGap) && (force || now - lastSeek >= profile.seekInterval)) {
      return { seek: target, rate: 1, gap, reason: "최신 버퍼로 이동" };
    }
    if (ahead < margin || gap <= margin + profile.stopGap) return { rate: 1, gap, reason: "안정 재생" };
    return { rate: gap > margin + profile.fastGap ? profile.fastRate : profile.slowRate, gap, reason: "실시간 따라잡는 중" };
  }

  function channelId(path) {
    return path.match(/^\/(?:live\/)?([a-f0-9]{32})\/?$/i)?.[1]?.toLowerCase() || "";
  }
  function channelGroup(item, favorites = []) {
    if (favorites.includes(item.id)) return 0;
    return item.openLive === true ? (item.followed === false ? 2 : 1) : (item.followed === false ? 4 : 3);
  }
  function orderChannels(items, favorites = [], order = []) {
    const positions = new Map(order.map((id, i) => [id, i]));
    return [...items].sort((a, b) => channelGroup(a, favorites) - channelGroup(b, favorites) ||
      (positions.get(a.id) ?? 1e9) - (positions.get(b.id) ?? 1e9));
  }
  globalThis.ChzzkTools = Object.freeze({ version: "0.10.19", defaults, features, koreanFromEnglish, catchUpProfile, planCatchUp, channelId, orderChannels, channelGroup });
})();
