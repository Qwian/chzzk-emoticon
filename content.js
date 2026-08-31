(() => {
  const KEY_CODES = new Set([
    "Minus",
    "Equal",
    "BracketLeft",
    "BracketRight",
    "Semicolon",
    "Quote"
  ]);

  const DEFAULT_SETTINGS = {
    enabled: true,
    sendImmediately: false,
    mappings: {}
  };

  const CHAT_INPUT_SELECTORS = [
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
    return {
      ...DEFAULT_SETTINGS,
      ...value,
      mappings: { ...DEFAULT_SETTINGS.mappings, ...value?.mappings }
    };
  }

  chrome.storage.local.get("settings").then(({ settings: stored }) => {
    settings = mergeSettings(stored);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.settings) {
      settings = mergeSettings(changes.settings.newValue);
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
    const src = normalizedSource(image?.currentSrc || image?.src || "");

    if (!label && !alt && !src) return null;
    if (label === "이모티콘") return null;

    return { type: "native", label, alt, src };
  }

  function scoreCandidate(candidate, mapping) {
    const fingerprint = fingerprintFromElement(candidate);
    if (!fingerprint) return 0;

    let score = 0;
    if (mapping.src && fingerprint.src === mapping.src) score += 8;
    if (mapping.alt && fingerprint.alt === mapping.alt) score += 4;
    if (mapping.label && fingerprint.label === mapping.label) score += 4;
    if (mapping.label && fingerprint.label.includes(mapping.label)) score += 1;
    return score;
  }

  async function waitForNativeEmote(mapping, timeout = 2500) {
    const started = performance.now();
    while (performance.now() - started < timeout) {
      const candidates = [...document.querySelectorAll("button, [role='button']")];
      const ranked = candidates
        .map((candidate) => ({ candidate, score: scoreCandidate(candidate, mapping) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score);
      if (ranked[0]) return ranked[0].candidate;
      await new Promise((resolve) => window.setTimeout(resolve, 80));
    }
    return null;
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

  async function insertNativeEmote(input, mapping) {
    const pickerButton = findEmotePickerButton();
    if (!pickerButton) {
      showToast("치지직 이모티콘 버튼을 찾지 못했습니다.", "error");
      return;
    }

    pickerButton.click();
    const emoteButton = await waitForNativeEmote(mapping);
    if (!emoteButton) {
      showToast("등록한 이모티콘을 현재 선택창에서 찾지 못했습니다.", "error");
      return;
    }

    emoteButton.click();
    await new Promise((resolve) => window.setTimeout(resolve, 30));
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

  window.addEventListener("keydown", async (event) => {
    if (
      busy ||
      !settings.enabled ||
      (event.repeat && settings.sendImmediately) ||
      event.isComposing ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      !event.getModifierState("CapsLock") ||
      !KEY_CODES.has(event.code)
    ) return;

    const mapping = settings.mappings[event.code];
    if (!mapping) return;

    const input = findFocusedChatInput();
    if (!input) return;

    event.preventDefault();
    event.stopImmediatePropagation();
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

    const next = mergeSettings(settings);
    next.mappings[capture.code] = fingerprint;
    await chrome.storage.local.set({ settings: next });
    showToast(`${capture.key} 키에 ${fingerprint.label || fingerprint.alt || "이모티콘"} 등록 완료`);
    capture = null;
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

    capture = { code: message.code, key: message.key };
    pickerButton.click();
    showToast(`이제 ${message.key} 키에 등록할 이모티콘을 클릭하세요.`);
    sendResponse({ ok: true });
    return undefined;
  });
})();
