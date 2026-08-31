(() => {
  const LEGACY_KEY_LABELS = {
    Minus: "-",
    Equal: "=",
    BracketLeft: "[",
    BracketRight: "]",
    Semicolon: ";",
    Quote: "'"
  };

  const DEFAULT_SETTINGS = {
    enabled: true,
    sendImmediately: false,
    shortcuts: []
  };

  const INSERT_EVENT = "chzzk-caps-emote:insert";
  const RESULT_EVENT = "chzzk-caps-emote:result";
  const CONFIG_EVENT = "chzzk-caps-emote:config";
  const SHORTCUT_EVENT = "chzzk-caps-emote:shortcut";
  const EMOTE_CODE_PATTERN = /^\{:[^{}]+:}$/;

  const CHAT_INPUT_SELECTORS = [
    "#aside-chatting pre[contenteditable='true']",
    "#aside-chatting [contenteditable='true']",
    "textarea[placeholder*='채팅']",
    "textarea[aria-label*='채팅']",
    "[contenteditable='true'][data-placeholder*='채팅']",
    "[contenteditable='true'][aria-label*='채팅']",
    "[role='textbox'][aria-label*='채팅']"
  ];

  let settings = DEFAULT_SETTINGS;
  let capture = null;
  let busy = false;

  function mergeSettings(value) {
    const shortcuts = Array.isArray(value?.shortcuts)
      ? value.shortcuts
      : Object.entries(value?.mappings || {}).map(([code, mapping]) => ({
          id: `legacy-${code}`,
          code,
          keyLabel: LEGACY_KEY_LABELS[code] || code,
          mapping
        }));

    return {
      ...DEFAULT_SETTINGS,
      ...value,
      shortcuts
    };
  }

  function publishShortcutConfig() {
    const codes = settings.enabled
      ? settings.shortcuts.filter(({ code, mapping }) => code && mapping).map(({ code }) => code)
      : [];
    document.dispatchEvent(new CustomEvent(CONFIG_EVENT, { detail: { codes } }));
  }

  chrome.storage.local.get("settings").then(({ settings: stored }) => {
    settings = mergeSettings(stored);
    publishShortcutConfig();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.settings) {
      settings = mergeSettings(changes.settings.newValue);
      publishShortcutConfig();
    }
  });

  function showToast(message, kind = "normal") {
    document.querySelector("#chzzk-caps-emote-toast")?.remove();
    const toast = document.createElement("div");
    toast.id = "chzzk-caps-emote-toast";
    toast.textContent = message;
    Object.assign(toast.style, {
      position: "fixed",
      right: "24px",
      bottom: "24px",
      zIndex: "2147483647",
      maxWidth: "360px",
      padding: "13px 16px",
      border: `1px solid ${kind === "error" ? "#ff6877" : "#00ffa3"}`,
      borderRadius: "10px",
      background: "rgba(14, 17, 16, .96)",
      color: kind === "error" ? "#ff9ba5" : "#f4f7f5",
      boxShadow: "0 10px 30px rgba(0, 0, 0, .35)",
      font: "600 13px/1.45 system-ui, sans-serif"
    });
    document.documentElement.append(toast);
    window.setTimeout(() => toast.remove(), 3500);
  }

  function findChatInput() {
    for (const selector of CHAT_INPUT_SELECTORS) {
      const elements = [...document.querySelectorAll(selector)];
      const input = elements.find((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && !element.disabled;
      });
      if (input) return input;
    }
    return null;
  }

  function isEditable(element) {
    return Boolean(
      element?.matches?.("input, textarea, [contenteditable='true'], [role='textbox']")
    );
  }

  function findFocusedChatInput() {
    const active = document.activeElement;
    if (!isEditable(active)) return null;

    const hint = `${active.getAttribute("placeholder") || ""} ${active.getAttribute("aria-label") || ""} ${active.getAttribute("data-placeholder") || ""}`;
    if (hint.includes("채팅")) return active;

    const knownInput = findChatInput();
    if (
      knownInput &&
      (active === knownInput || knownInput.contains(active) || active.contains(knownInput))
    ) return active;

    const chatContainer = active.closest(
      "form, aside, [class*='chat'], [class*='Chat']"
    );
    if (!chatContainer) return null;

    const hasEmoteButton = [...chatContainer.querySelectorAll("button")].some((button) => {
      const name = `${button.getAttribute("aria-label") || ""} ${button.title || ""} ${button.textContent || ""}`.trim();
      return name === "이모티콘";
    });
    return hasEmoteButton ? active : null;
  }

  function insertText(input, text) {
    input.focus();

    if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? input.value.length;
      const nextValue = `${input.value.slice(0, start)}${text}${input.value.slice(end)}`;
      const prototype = input instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      setter?.call(input, nextValue);
      input.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: text
      }));
      input.setSelectionRange(start + text.length, start + text.length);
      return;
    }

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(input);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand("insertText", false, text);
    input.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "insertText",
      data: text
    }));
  }

  function findEmotePickerButton() {
    const buttons = [...document.querySelectorAll("button")];
    return buttons.find((button) => {
      const name = `${button.getAttribute("aria-label") || ""} ${button.title || ""} ${button.textContent || ""}`.trim();
      const rect = button.getBoundingClientRect();
      return name === "이모티콘" && rect.width > 0 && rect.height > 0;
    });
  }

  function normalizedSource(source) {
    if (!source) return "";
    try {
      const url = new URL(source, location.href);
      return `${url.hostname}${url.pathname}`;
    } catch {
      return source.split("?")[0];
    }
  }

  function fingerprintFromElement(element) {
    const candidate = element.closest("button, [role='button']");
    if (!candidate) return null;

    const image = candidate.querySelector("img") || element.closest("img");
    if (!image) return null;
    const label = (
      candidate.getAttribute("aria-label") ||
      candidate.title ||
      image?.alt ||
      candidate.textContent ||
      ""
    ).trim();
    const alt = (image?.alt || "").trim();
    const imageUrl = image?.currentSrc || image?.src || "";
    const src = normalizedSource(imageUrl);
    const code = [alt, label].find((value) => EMOTE_CODE_PATTERN.test(value)) || "";

    if (!code || !imageUrl) return null;

    return { type: "native", label: code, alt, code, imageUrl, src };
  }

  async function waitForChatValueChange(valueBefore, timeout = 600) {
    const started = performance.now();
    while (performance.now() - started < timeout) {
      const input = findChatInput();
      const value = input?.innerHTML ?? input?.value ?? "";
      if (value !== valueBefore) return true;
      await new Promise((resolve) => window.setTimeout(resolve, 40));
    }
    return false;
  }

  async function sendIfEnabled(input) {
    if (!settings.sendImmediately) return;
    await new Promise((resolve) => window.setTimeout(resolve, 80));

    const nearbySendButton = input.closest("form, section, aside, [class*='chat']")
      ?.querySelector("button:not([disabled])");
    const sendButton = nearbySendButton?.textContent?.trim() === "채팅"
      ? nearbySendButton
      : [...document.querySelectorAll("button:not([disabled])")].find(
          (button) => button.textContent?.trim() === "채팅"
        );
    if (sendButton) {
      sendButton.click();
      return;
    }

    input.focus();
    input.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter",
      code: "Enter",
      bubbles: true,
      cancelable: true
    }));
    input.dispatchEvent(new KeyboardEvent("keyup", {
      key: "Enter",
      code: "Enter",
      bubbles: true,
      cancelable: true
    }));
  }

  function nativeCode(mapping) {
    return [mapping.code, mapping.alt, mapping.label].find(
      (value) => EMOTE_CODE_PATTERN.test(value || "")
    ) || "";
  }

  function nativeImageUrl(mapping) {
    if (mapping.imageUrl) return mapping.imageUrl;
    if (!mapping.src) return "";
    return /^https:\/\//i.test(mapping.src)
      ? mapping.src
      : `https://${mapping.src}`;
  }

  function requestDirectInsertion(mapping) {
    const code = nativeCode(mapping);
    const imageUrl = nativeImageUrl(mapping);
    if (!code || !imageUrl) {
      return Promise.resolve({
        ok: false,
        message: "이 매핑은 구버전 형식입니다. 이모티콘을 다시 등록해주세요."
      });
    }

    const requestId = crypto.randomUUID();
    return new Promise((resolve) => {
      const timeout = window.setTimeout(() => {
        document.removeEventListener(RESULT_EVENT, onResult);
        resolve({ ok: false, message: "치지직 입력 브리지에 연결하지 못했습니다." });
      }, 800);

      function onResult(event) {
        if (event.detail?.requestId !== requestId) return;
        window.clearTimeout(timeout);
        document.removeEventListener(RESULT_EVENT, onResult);
        resolve(event.detail);
      }

      document.addEventListener(RESULT_EVENT, onResult);
      document.dispatchEvent(new CustomEvent(INSERT_EVENT, {
        detail: { requestId, code, imageUrl }
      }));
    });
  }

  async function insertNativeEmote(input, mapping) {
    const result = await requestDirectInsertion(mapping);
    if (!result.ok) {
      showToast(result.message || "이모티콘을 입력하지 못했습니다.", "error");
      return;
    }
    input.focus();
    await sendIfEnabled(input);
  }

  async function handleShortcut(input, mapping) {
    if (mapping.type === "native") {
      await insertNativeEmote(input, mapping);
    } else if (mapping.type === "text" && mapping.value) {
      insertText(input, mapping.value);
      await sendIfEnabled(input);
    }
  }

  document.addEventListener(SHORTCUT_EVENT, async (event) => {
    const shortcut = settings.shortcuts.find(({ code }) => code === event.detail?.code);
    if (!settings.enabled || !shortcut) return;
    const mapping = shortcut.mapping;
    if (!mapping) return;

    const input = findFocusedChatInput();
    if (!input) return;

    if (busy || (event.detail?.repeat && settings.sendImmediately)) return;

    busy = true;
    try {
      await handleShortcut(input, mapping);
    } finally {
      busy = false;
    }
  }, true);

  window.addEventListener("click", async (event) => {
    if (!capture || !event.isTrusted) return;
    const fingerprint = fingerprintFromElement(event.target);
    if (!fingerprint) return;

    const currentCapture = capture;
    capture = null;
    const inputBefore = findChatInput();
    const valueBefore = inputBefore?.innerHTML ?? inputBefore?.value ?? "";
    if (!(await waitForChatValueChange(valueBefore))) {
      showToast("사용할 수 없거나 잠긴 이모티콘은 등록할 수 없습니다.", "error");
      return;
    }

    const next = mergeSettings(settings);
    const shortcutIndex = next.shortcuts.findIndex(({ id, code }) =>
      currentCapture.shortcutId ? id === currentCapture.shortcutId : code === currentCapture.code
    );
    if (shortcutIndex < 0) {
      showToast("등록할 단축키를 찾지 못했습니다. 팝업에서 다시 시도하세요.", "error");
      return;
    }
    next.shortcuts[shortcutIndex] = {
      ...next.shortcuts[shortcutIndex],
      mapping: fingerprint
    };
    await chrome.storage.local.set({ settings: next });
    const { settings: saved } = await chrome.storage.local.get("settings");
    const savedShortcut = mergeSettings(saved).shortcuts.find(({ id, code }) =>
      currentCapture.shortcutId ? id === currentCapture.shortcutId : code === currentCapture.code
    );
    if (savedShortcut?.mapping?.code !== fingerprint.code) {
      showToast("이모티콘 설정을 저장하지 못했습니다. 다시 시도하세요.", "error");
      return;
    }
    showToast(`${currentCapture.key} 키에 ${fingerprint.code} 등록 완료`);
  }, true);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "START_EMOTE_CAPTURE") return undefined;

    const chatInput = findChatInput();
    const loginText = `${chatInput?.getAttribute("placeholder") || ""} ${chatInput?.getAttribute("aria-label") || ""}`;
    if (!chatInput || loginText.includes("로그인")) {
      sendResponse({
        ok: false,
        message: "치지직에 로그인하고 라이브 채팅을 연 뒤 다시 시도하세요."
      });
      return undefined;
    }

    const pickerButton = findEmotePickerButton();
    if (!pickerButton) {
      sendResponse({
        ok: false,
        message: "로그인한 치지직 라이브 채팅에서 다시 시도하세요."
      });
      return undefined;
    }

    capture = {
      shortcutId: message.shortcutId,
      code: message.code,
      key: message.key
    };
    pickerButton.click();
    showToast(`이제 ${message.key} 키에 등록할 이모티콘을 클릭하세요.`);
    sendResponse({ ok: true });
    return undefined;
  });
})();
