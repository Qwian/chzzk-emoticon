const KEY_DEFINITIONS = [
  { code: "Minus", key: "-" },
  { code: "Equal", key: "=" },
  { code: "BracketLeft", key: "[" },
  { code: "BracketRight", key: "]" },
  { code: "Semicolon", key: ";" },
  { code: "Quote", key: "'" }
];

const DEFAULT_SETTINGS = {
  enabled: true,
  sendImmediately: false,
  mappings: {}
};

const enabledInput = document.querySelector("#enabled");
const sendInput = document.querySelector("#send-immediately");
const list = document.querySelector("#mapping-list");
const status = document.querySelector("#status");

let settings = DEFAULT_SETTINGS;

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("error", isError);
}

async function saveSettings() {
  await chrome.storage.local.set({ settings });
}

function nativeDescription(mapping) {
  return mapping?.code || mapping?.alt || mapping?.label || "치지직 이모티콘";
}

function createMappingRow(definition) {
  const row = document.createElement("div");
  row.className = "mapping-row";

  const key = document.createElement("kbd");
  key.textContent = definition.key;

  const input = document.createElement("input");
  input.className = "mapping-input";
  input.placeholder = "이모지 또는 문자열";
  input.setAttribute("aria-label", `${definition.key} 키에 입력할 문자열`);

  const mapping = settings.mappings[definition.code];
  if (mapping?.type === "native") {
    input.value = nativeDescription(mapping);
    input.dataset.native = "true";
    input.readOnly = true;
  } else {
    input.value = mapping?.value || "";
  }

  input.addEventListener("input", async () => {
    settings.mappings[definition.code] = input.value
      ? { type: "text", value: input.value }
      : undefined;
    await saveSettings();
    setStatus("저장됨");
  });

  const pick = document.createElement("button");
  pick.type = "button";
  pick.className = "pick-button";
  pick.textContent = "치지직 선택";
  pick.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      setStatus("활성 브라우저 탭을 찾지 못했습니다.", true);
      return;
    }

    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: "START_EMOTE_CAPTURE",
        code: definition.code,
        key: definition.key
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

  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "clear-button";
  clear.title = "매핑 지우기";
  clear.setAttribute("aria-label", `${definition.key} 키 매핑 지우기`);
  clear.textContent = "×";
  clear.addEventListener("click", async () => {
    delete settings.mappings[definition.code];
    await saveSettings();
    input.readOnly = false;
    input.dataset.native = "false";
    input.value = "";
    setStatus("매핑을 지웠습니다.");
  });

  row.append(key, input, pick, clear);
  return row;
}

async function initialize() {
  const stored = await chrome.storage.local.get("settings");
  settings = {
    ...DEFAULT_SETTINGS,
    ...stored.settings,
    mappings: { ...DEFAULT_SETTINGS.mappings, ...stored.settings?.mappings }
  };

  enabledInput.checked = settings.enabled;
  sendInput.checked = settings.sendImmediately;
  KEY_DEFINITIONS.forEach((definition) => list.append(createMappingRow(definition)));

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
}

initialize();
