(() => {
  const defaults = Object.freeze({
    koreanSearch: true, favorites: true, catchUp: true, catchUpMode: "2", followingExpanded: true, followingRefresh: true,
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
    next.catchUpMode = normalizeCatchUpMode(next.catchUpMode);
    return next;
  }

  const catchUpOptions = Object.freeze([
    Object.freeze({ value: "2", seconds: 2, label: "2초", hint: "2초 여유\n비교적 안정적 · 끊길 수 있음" }),
    Object.freeze({ value: "1.5", seconds: 1.5, label: "1.5초", hint: "1.5초 여유\n회선에 따라 끊길 수 있음" }),
    Object.freeze({ value: "1", seconds: 1, label: "1초", hint: "1초 여유\n지연이 짧지만 끊길 수 있음" })
  ]);
  function normalizeCatchUpMode(mode) {
    const value = String(mode);
    return catchUpOptions.some(option => option.value === value) ? value : "2";
  }
  const catchUpProfiles = Object.freeze(Object.fromEntries(catchUpOptions.map(option => [option.value,
    Object.freeze({ initialMargin: option.seconds, minMargin: option.seconds, maxMargin: option.seconds,
      startDelay: 0, recoveryDelay: 2000, adDelay: 750, seekCooldown: 750,
      forceSeekGap: 0.1, stopGap: 0.15,
      fastGap: 2, fastRate: 1.15, mediumGap: 0.5, mediumRate: 1.08, slowRate: 1.03, eventDriven: true })
  ])));
  function catchUpProfile(mode) { return catchUpProfiles[normalizeCatchUpMode(mode)]; }

  function planCatchUp({ time, seekable, buffered, force = false, mode = "2" }) {
    const profile = catchUpProfile(mode);
    const margin = profile.initialMargin;
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
    // Automatic recovery only accelerates. A jump is reserved for catch-now.
    if (force && target >= Math.max(latest[0], fresh[0]) && target > time + profile.forceSeekGap) {
      return { seek: target, rate: 1, gap: margin, reason: "최신 버퍼로 이동" };
    }
    if (ahead < margin || gap <= margin + profile.stopGap) return { rate: 1, gap, reason: "안정 재생" };
    const rate = gap > margin + profile.fastGap ? profile.fastRate : gap > margin + profile.mediumGap ? profile.mediumRate : profile.slowRate;
    return { rate, gap, reason: rate + "배속으로 따라잡는 중" };
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
    return [...items].sort((a, b) => {
      const group = channelGroup(a, favorites), difference = group - channelGroup(b, favorites);
      if (difference) return difference;
      if (group === 2) {
        const left = channelCategory(a), right = channelCategory(b);
        const priority = category => category.toUpperCase() === "TALK" ? 0 : category ? 2 : 1;
        const category = priority(left) - priority(right) || left.localeCompare(right, "ko", { numeric: true });
        if (category) return category;
      }
      return (positions.get(a.id) ?? 1e9) - (positions.get(b.id) ?? 1e9);
    });
  }
  function channelCategory(item) { return typeof item.liveCategory === "string" ? item.liveCategory.trim() : ""; }
  globalThis.ChzzkTools = Object.freeze({ version: "0.10.25", defaults, features, koreanFromEnglish, catchUpOptions, catchUpProfile, planCatchUp, channelId, orderChannels, channelGroup, channelCategory });
})();
