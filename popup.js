const LEGACY_KEY_LABELS = {
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Semicolon: ";",
  Quote: "'"
};

const DEFAULT_SHORTCUTS = Object.entries(LEGACY_KEY_LABELS).map(([code, keyLabel]) => ({
  id: `default-${code}`,
  code,
  keyLabel,
  mapping: null
}));

const BLOCKED_CODES = new Set([
  "CapsLock",
  "Enter",
  "Escape",
  "Tab",
  "ShiftLeft",
  "ShiftRight",
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "MetaLeft",
  "MetaRight"
]);

const DEFAULT_SETTINGS = {
  enabled: true,
  diagnostics: false,
  shortcuts: DEFAULT_SHORTCUTS
};

const enabledInput = document.querySelector("#enabled");
const list = document.querySelector("#mapping-list");
const addButton = document.querySelector("#add-shortcut");
const status = document.querySelector("#status");
const diagnosticsInput = document.querySelector("#diagnostics-enabled");
const diagnosticLog = document.querySelector("#diagnostic-log");
const refreshDiagnosticsButton = document.querySelector("#refresh-diagnostics");
const clearDiagnosticsButton = document.querySelector("#clear-diagnostics");
const diagnosticsPanel = document.querySelector("#diagnostics-panel");

let settings = DEFAULT_SETTINGS;
let recordingId = null;

function createId() {
  return crypto.randomUUID();
}

function normalizeSettings(stored = {}) {
  const shortcuts = Array.isArray(stored.shortcuts)
    ? stored.shortcuts
    : stored.mappings
      ? Object.entries(stored.mappings).map(([code, mapping]) => ({
          id: `legacy-${code}`,
          code,
          keyLabel: LEGACY_KEY_LABELS[code] || code,
          mapping
        }))
      : DEFAULT_SHORTCUTS;

  return {
    enabled: stored.enabled ?? DEFAULT_SETTINGS.enabled,
    diagnostics: stored.diagnostics ?? DEFAULT_SETTINGS.diagnostics,
    shortcuts: shortcuts.map((shortcut) => ({
      id: shortcut.id || createId(),
      code: shortcut.code || "",
      keyLabel: shortcut.keyLabel || LEGACY_KEY_LABELS[shortcut.code] || shortcut.code || "키",
      mapping: shortcut.mapping || null
    }))
  };
}

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("error", isError);
}

async function saveSettings() {
  const { mappings: _legacyMappings, ...currentSettings } = settings;
  await chrome.storage.local.set({ settings: currentSettings });
}

async function syncDiagnosticsWithActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    setStatus("활성 치지직 탭을 찾지 못했습니다.", true);
    return false;
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "SYNC_DIAGNOSTICS"
    });
    if (!response?.ok) throw new Error("No diagnostic response");
    setStatus(`치지직 진단 연결됨 (${response.version})`);
    return true;
  } catch {
    setStatus("치지직 페이지를 새로고침한 뒤 진단을 다시 켜세요.", true);
    return false;
  }
}

function updateShortcut(id, update) {
  settings.shortcuts = settings.shortcuts.map((shortcut) =>
    shortcut.id === id ? { ...shortcut, ...update } : shortcut
  );
}

function formatKeyLabel(event) {
  if (/^Key[A-Z]$/.test(event.code)) return event.code.slice(3);
  if (/^Digit[0-9]$/.test(event.code)) return event.code.slice(5);
  if (/^Numpad[0-9]$/.test(event.code)) return `N${event.code.slice(6)}`;

  const aliases = {
    Space: "Space",
    Backspace: "⌫",
    Delete: "Del",
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→"
  };
  return aliases[event.code] || (event.key.length <= 3 ? event.key : event.code);
}

function nativeImageUrl(mapping) {
  if (mapping?.imageUrl) return mapping.imageUrl;
  if (!mapping?.src) return "";
  return /^https:\/\//i.test(mapping.src) ? mapping.src : `https://${mapping.src}`;
}

function nativeDescription(mapping) {
  return mapping?.code || mapping?.alt || mapping?.label || "치지직 이모티콘";
}

function stopRecording() {
  recordingId = null;
  document.removeEventListener("keydown", captureKey, true);
  renderMappings();
}

async function captureKey(event) {
  if (!recordingId) return;
  event.preventDefault();
  event.stopImmediatePropagation();

  if (event.code === "Escape") {
    stopRecording();
    setStatus("키 지정을 취소했습니다.");
    return;
  }

  if (BLOCKED_CODES.has(event.code)) {
    setStatus("Caps Lock, Enter, Esc, Tab과 보조키는 지정할 수 없습니다.", true);
    return;
  }

  const duplicate = settings.shortcuts.find(
    (shortcut) => shortcut.id !== recordingId && shortcut.code === event.code
  );
  if (duplicate) {
    setStatus(`${duplicate.keyLabel} 키가 이미 등록되어 있습니다.`, true);
    return;
  }

  const id = recordingId;
  updateShortcut(id, { code: event.code, keyLabel: formatKeyLabel(event) });
  await saveSettings();
  stopRecording();
  setStatus("단축키를 저장했습니다.");
}

function startRecording(id) {
  recordingId = id;
  renderMappings();
  document.addEventListener("keydown", captureKey, true);
  setStatus("지정할 키를 하나 누르세요. Esc는 취소입니다.");
}

function createMappingControl(shortcut) {
  const mapping = shortcut.mapping;
  if (mapping?.type === "native") {
    const preview = document.createElement("div");
    preview.className = "native-preview";
    preview.title = nativeDescription(mapping);

    const image = document.createElement("img");
    image.src = nativeImageUrl(mapping);
    image.alt = "";

    const description = document.createElement("span");
    description.textContent = "치지직 이모티콘";
    preview.append(image, description);
    return preview;
  }

  const input = document.createElement("input");
  input.className = "mapping-input";
  input.placeholder = "이모지 또는 문자열";
  input.value = mapping?.value || "";
  input.setAttribute("aria-label", `${shortcut.keyLabel} 키에 입력할 문자열`);
  input.addEventListener("input", async () => {
    updateShortcut(shortcut.id, {
      mapping: input.value ? { type: "text", value: input.value } : null
    });
    await saveSettings();
    setStatus("저장됨");
  });
  return input;
}

function createMappingRow(shortcut) {
  const row = document.createElement("div");
  row.className = "mapping-row";

  const key = document.createElement("button");
  key.type = "button";
  key.className = `key-button${recordingId === shortcut.id ? " recording" : ""}`;
  key.textContent = recordingId === shortcut.id ? "…" : shortcut.keyLabel || "키";
  key.title = "클릭한 뒤 지정할 키를 누르세요";
  key.setAttribute("aria-label", `${shortcut.keyLabel || "미지정"} 단축키 변경`);
  key.addEventListener("click", () => startRecording(shortcut.id));

  const mappingControl = createMappingControl(shortcut);

  const pick = document.createElement("button");
  pick.type = "button";
  pick.className = "pick-button";
  pick.textContent = "치지직 선택";
  pick.disabled = !shortcut.code;
  pick.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      setStatus("활성 브라우저 탭을 찾지 못했습니다.", true);
      return;
    }

    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: "START_EMOTE_CAPTURE",
        shortcutId: shortcut.id,
        code: shortcut.code,
        key: shortcut.keyLabel
      });

      if (!response?.ok) {
        setStatus(response?.message || "이모티콘 선택창을 열지 못했습니다.", true);
        return;
      }
      window.close();
    } catch {
      setStatus("치지직 페이지를 새로고침한 뒤 다시 시도하세요.", true);
    }
  });

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "clear-button";
  remove.title = "단축키 삭제";
  remove.setAttribute("aria-label", `${shortcut.keyLabel || "미지정"} 단축키 삭제`);
  remove.textContent = "×";
  remove.addEventListener("click", async () => {
    settings.shortcuts = settings.shortcuts.filter((item) => item.id !== shortcut.id);
    await saveSettings();
    renderMappings();
    setStatus("단축키를 삭제했습니다.");
  });

  row.append(key, mappingControl, pick, remove);
  return row;
}

function renderMappings() {
  list.replaceChildren(...settings.shortcuts.map(createMappingRow));
  list.querySelector(".key-button.recording")?.focus();
}

function settingsSignature(value) {
  return JSON.stringify(value);
}

function applyStoredSettings(stored, message = "") {
  const next = normalizeSettings(stored);
  if (settingsSignature(next) === settingsSignature(settings)) return;

  recordingId = null;
  document.removeEventListener("keydown", captureKey, true);
  settings = next;
  enabledInput.checked = settings.enabled;
  diagnosticsInput.checked = settings.diagnostics;
  diagnosticsPanel.open = settings.diagnostics;
  renderMappings();
  if (message) setStatus(message);
}

async function initialize() {
  const stored = await chrome.storage.local.get(["settings", "diagnosticLog"]);
  settings = normalizeSettings(stored.settings);
  if (
    !stored.settings ||
    (stored.settings?.mappings && !Array.isArray(stored.settings.shortcuts)) ||
    Object.hasOwn(stored.settings || {}, "sendImmediately")
  ) {
    await saveSettings();
  }

  enabledInput.checked = settings.enabled;
  diagnosticsInput.checked = settings.diagnostics;
  diagnosticsPanel.open = settings.diagnostics;
  diagnosticLog.value = (stored.diagnosticLog || []).map((entry) => JSON.stringify(entry)).join("\n");
  renderMappings();

  enabledInput.addEventListener("change", async () => {
    settings.enabled = enabledInput.checked;
    await saveSettings();
    setStatus(settings.enabled ? "단축키를 켰습니다." : "단축키를 껐습니다.");
  });

  diagnosticsInput.addEventListener("change", async () => {
    settings.diagnostics = diagnosticsInput.checked;
    if (settings.diagnostics) {
      await chrome.storage.local.set({ diagnosticLog: [] });
      diagnosticLog.value = "";
    }
    await saveSettings();
    if (settings.diagnostics) {
      await syncDiagnosticsWithActiveTab();
    } else {
      setStatus("진단 기록을 껐습니다.");
    }
  });

  refreshDiagnosticsButton.addEventListener("click", async () => {
    const storedLog = await chrome.storage.local.get("diagnosticLog");
    diagnosticLog.value = (storedLog.diagnosticLog || [])
      .map((entry) => JSON.stringify(entry)).join("\n");
    diagnosticLog.select();
    setStatus("로그를 불러왔습니다. Ctrl+C로 복사하세요.");
  });

  clearDiagnosticsButton.addEventListener("click", async () => {
    await chrome.storage.local.set({ diagnosticLog: [] });
    diagnosticLog.value = "";
    setStatus("진단 로그를 지웠습니다.");
  });

  addButton.addEventListener("click", async () => {
    const shortcut = { id: createId(), code: "", keyLabel: "키", mapping: null };
    settings.shortcuts.push(shortcut);
    await saveSettings();
    startRecording(shortcut.id);
  });

  if (settings.diagnostics) await syncDiagnosticsWithActiveTab();
  await initializeFeatures();
  await initializeVersionStatus();
}

async function initializeFeatures() {
  if (!globalThis.ChzzkTools) return;
  const core = globalThis.ChzzkTools;
  const panel = document.createElement("details");
  panel.className = "diagnostics feature-panel";
  const summary = document.createElement("summary");
  summary.textContent = "검색 · 채널 목록 · 플레이어 설정";
  panel.append(summary);
  const stored = await chrome.storage.local.get("features");
  let features = core.features(stored.features);
  const controls = new Map();
  const labels = {
    globalSpeed: "모든 사이트 속도·프레임 단축키",
    listPreview: "치지직·숲 목록 우클릭 소리 미리보기",
    sidebarPreview: "팔로잉·보관 채널에 마우스를 올리면 소리 재생",
    freeChat: "치지직·숲 자유 배치 채팅 (이동·크기·투명도 저장)",
    highestQuality: "치지직에서 선택 가능한 최고 화질 자동 선택",
    adblockQuality: "광고 차단 감지로 인한 360p 제한 보정 (새로고침 필요)",
    dismissAdNotice: "치지직 광고 차단 안내 숨김",
    koreanSearch: "영타로 입력해도 스트리머 바로 찾기",
    favorites: "팔로우 없이 보관 채널 사용",
    followingExpanded: "팔로잉 채널 목록 상시 펼치기",
    followingRefresh: "팔로잉 방송 상태 30초마다 갱신",
    catchUp: "끊김에 맞춰 조절하는 자동 실시간 따라잡기",
    adMute: "광고 자동 음소거",
    adAutoSkip: "활성화된 광고 SKIP 버튼 자동 누르기",
    adMini: "본방이 재생 중이면 광고를 우측 상단에 작게",
    mainAudio: "광고 중 본방의 기존 소리 유지"
  };
  for (const [key, text] of Object.entries(labels)) {
    const label = document.createElement("label"), input = document.createElement("input");
    label.className = "send-option";
    input.type = "checkbox"; input.checked = Boolean(features[key]); input.id = `feature-${key}`;
    label.append(input, document.createTextNode(text)); panel.append(label); controls.set(key, input);
    input.addEventListener("change", () => saveFeature(key, input.checked));
  }
  const chatNote = document.createElement("p"); chatNote.className = "intro";
  chatNote.textContent = "자유 배치 채팅: 치지직 넓은 화면·숲 스크린모드에서 이동·크기·투명도를 조절합니다. 겹치기를 끄면 두 사이트 모두 채팅 왼쪽 경계로 폭을 조절합니다. 240px 최소 폭 제한은 없습니다. Alt+Shift+C로 겹치기를 전환합니다. 기존 템퍼몽키 자유 배치 스크립트가 실행 중이면 확장 쪽은 대기합니다. 대체해서 쓰려면 기존 스크립트를 끄고 탭을 새로고침하세요. 기존 배치값은 자동 이전되지 않습니다.";
  panel.append(chatNote);
  const speedLabel = document.createElement("label"), speed = document.createElement("select");
  speedLabel.className = "send-option"; speedLabel.append(document.createTextNode("광고 재생 속도 "));
  speed.id = "feature-adSpeed";
  for (const value of [1, 2, 4, 8, 16]) {
    const option = document.createElement("option");
    option.value = String(value); option.textContent = value === 1 ? "원래 속도" : `${value}배`;
    speed.append(option);
  }
  speed.value = String(features.adSpeed); speedLabel.append(speed); panel.append(speedLabel); controls.set("adSpeed", speed);
  speed.addEventListener("change", () => saveFeature("adSpeed", Number(speed.value)));
  const adSpeedNote = document.createElement("p"); adSpeedNote.className = "intro";
  adSpeedNote.textContent = "광고 속도는 상한입니다. 버퍼가 부족하면 감속하고, 재생이 멈추면 해당 광고는 1배속으로 복구합니다. 플레이어가 배속을 반복 복원하면 강제 적용을 중단합니다.";
  panel.append(adSpeedNote);
  const note = document.createElement("p");
  note.className = "intro";
  note.textContent = ", / . : 0.1배 감소 / 증가 · / : 1배 · Shift+, / Shift+. : 이전 / 다음 프레임. 입력창에서는 작동하지 않습니다. FPS를 아직 읽지 못했으면 30fps로 추정합니다. 썸네일 우클릭으로 소리 미리보기, 다시 우클릭하거나 마우스를 빼면 종료합니다. 치즈 플래터의 자동 따라잡기는 끄고 사용하세요. 고화질 설치·로그인 조건과 실제 광고 차단 프로그램 설정은 자동 변경하지 않습니다.";
  panel.append(note); diagnosticsPanel.before(panel);
  async function saveFeature(key, value) {
    try {
      const latest = await chrome.storage.local.get("features");
      features = core.features({ ...latest.features, [key]: value });
      await chrome.storage.local.set({ features });
      setStatus("기능 설정을 저장했습니다.");
    } catch { setStatus("기능 설정을 저장하지 못했습니다.", true); }
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.features) return;
    features = core.features(changes.features.newValue);
    for (const [key, control] of controls) {
      if (control.type === "checkbox") control.checked = Boolean(features[key]);
      else control.value = String(features[key]);
    }
  });
}

async function initializeVersionStatus() {
  const element = document.createElement("p"); element.className = "footnote"; element.id = "version-status";
  document.querySelector("main").append(element);
  const codeVersion = globalThis.ChzzkTools?.version || "";
  const installed = chrome.runtime?.getManifest?.().version || codeVersion;
  if (installed !== codeVersion) { element.textContent = `설치 ${installed} · 소스 ${codeVersion} — 확장을 다시 로드하세요.`; return; }
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const result = tab?.id ? await chrome.tabs.sendMessage(tab.id, { type: "GET_TOOL_STATUS" }, { frameId: 0 }) : null;
    element.textContent = result?.codeVersion === codeVersion ? `확장 ${installed} · 페이지 ${result.codeVersion} 연결됨` :
      `확장 ${installed} · 페이지를 새로고침해야 합니다.`;
    if (result?.quality) {
      const q = result.quality;
      element.textContent += ` · 화질 응답 ${q.metadataResponses} / 보정 ${q.repairs}` +
        (result.videoHeight ? ` · 실제 ${result.videoHeight}p` : "");
      if (!q.enabled) element.textContent += " · 화질 보정 꺼짐";
      if (q.reason === "hook-unavailable") element.textContent += " · 화질 연결 실패";
    }
  } catch { element.textContent = `확장 ${installed} · 페이지 연결 없음 (페이지 새로고침 필요)`; }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.settings) return;
  applyStoredSettings(changes.settings.newValue, "등록 내용을 불러왔습니다.");
});

initialize();
