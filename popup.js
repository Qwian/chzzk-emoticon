const LEGACY_KEY_LABELS = {
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Semicolon: ";",
  Quote: "'"
};

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
  sendImmediately: false,
  shortcuts: []
};

const enabledInput = document.querySelector("#enabled");
const sendInput = document.querySelector("#send-immediately");
const list = document.querySelector("#mapping-list");
const addButton = document.querySelector("#add-shortcut");
const status = document.querySelector("#status");

let settings = DEFAULT_SETTINGS;
let recordingId = null;

function createId() {
  return crypto.randomUUID();
}

function normalizeSettings(stored = {}) {
  const shortcuts = Array.isArray(stored.shortcuts)
    ? stored.shortcuts
    : Object.entries(stored.mappings || {}).map(([code, mapping]) => ({
        id: `legacy-${code}`,
        code,
        keyLabel: LEGACY_KEY_LABELS[code] || code,
        mapping
      }));

  return {
    enabled: stored.enabled ?? DEFAULT_SETTINGS.enabled,
    sendImmediately: stored.sendImmediately ?? DEFAULT_SETTINGS.sendImmediately,
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
  sendInput.checked = settings.sendImmediately;
  renderMappings();
  if (message) setStatus(message);
}

async function initialize() {
  const stored = await chrome.storage.local.get("settings");
  settings = normalizeSettings(stored.settings);
  if (stored.settings?.mappings && !Array.isArray(stored.settings.shortcuts)) {
    await saveSettings();
  }

  enabledInput.checked = settings.enabled;
  sendInput.checked = settings.sendImmediately;
  renderMappings();

  enabledInput.addEventListener("change", async () => {
    settings.enabled = enabledInput.checked;
    await saveSettings();
    setStatus(settings.enabled ? "단축키를 켰습니다." : "단축키를 껐습니다.");
  });

  sendInput.addEventListener("change", async () => {
    settings.sendImmediately = sendInput.checked;
    await saveSettings();
    setStatus("전송 설정을 저장했습니다.");
  });

  addButton.addEventListener("click", async () => {
    const shortcut = { id: createId(), code: "", keyLabel: "키", mapping: null };
    settings.shortcuts.push(shortcut);
    await saveSettings();
    startRecording(shortcut.id);
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.settings) return;
  applyStoredSettings(changes.settings.newValue, "등록 내용을 불러왔습니다.");
});

initialize();
