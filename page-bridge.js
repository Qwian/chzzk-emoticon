(() => {
  if (window.__chzzkCapsEmoteBridgeInstalled) return;
  window.__chzzkCapsEmoteBridgeInstalled = true;

  const INSERT_EVENT = "chzzk-caps-emote:insert";
  const RESULT_EVENT = "chzzk-caps-emote:result";
  const CONFIG_EVENT = "chzzk-caps-emote:config";
  const SHORTCUT_EVENT = "chzzk-caps-emote:shortcut";
  const DEBUG_EVENT = "chzzk-caps-emote:debug";
  const EMOTE_CODE_PATTERN = /^\{:[^{}]+:}$/;
  let shortcutCodes = new Set();
  let imeGuard = null;
  let diagnosticsEnabled = false;

  function debug(type, event = null, extra = {}) {
    if (!diagnosticsEnabled) return;
    const editor = imeGuard?.editor;
    document.dispatchEvent(new CustomEvent(DEBUG_EVENT, {
      detail: {
        t: Math.round(performance.now()),
        type,
        code: event?.code || "",
        key: event?.key || "",
        inputType: event?.inputType || "",
        data: typeof event?.data === "string" ? event.data.slice(0, 16) : null,
        composing: Boolean(event?.isComposing),
        cancelable: Boolean(event?.cancelable),
        prevented: Boolean(event?.defaultPrevented),
        guardRemaining: imeGuard ? Math.round(imeGuard.expiresAt - performance.now()) : null,
        textLength: editor?.textContent?.length ?? null,
        childCount: editor?.childNodes?.length ?? null,
        ...extra
      }
    }));
  }

  function respond(requestId, ok, message = "") {
    document.dispatchEvent(new CustomEvent(RESULT_EVENT, {
      detail: { requestId, ok, message }
    }));
  }

  function moveCaretAfter(node) {
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function insertAtCaret(editor, node) {
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (range && editor.contains(range.commonAncestorContainer)) {
      range.deleteContents();
      range.insertNode(node);
    } else {
      editor.append(node);
    }
    moveCaretAfter(node);
  }

  function armImeGuard(editor, code) {
    imeGuard = {
      editor,
      code,
      expiresAt: performance.now() + 300
    };
  }

  function observeImeInput(event) {
    const guard = imeGuard;
    if (
      guard &&
      event.target === guard.editor &&
      !event.inputType?.startsWith("delete")
    ) debug("input-seen", event);
  }

  document.addEventListener(CONFIG_EVENT, (event) => {
    const codes = Array.isArray(event.detail?.codes) ? event.detail.codes : [];
    shortcutCodes = new Set(
      codes.filter((code) => typeof code === "string" && code.length <= 64)
    );
    diagnosticsEnabled = Boolean(event.detail?.diagnostics);
  }, true);

  window.addEventListener("keydown", (event) => {
    if (
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      !event.getModifierState("CapsLock") ||
      !shortcutCodes.has(event.code)
    ) return;

    const editor = document.activeElement;
    if (
      !(editor instanceof HTMLElement) ||
      !editor.isContentEditable ||
      !editor.closest("#aside-chatting")
    ) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    armImeGuard(editor, event.code);
    debug("keydown-blocked", event, { repeat: event.repeat });
    document.dispatchEvent(new CustomEvent(SHORTCUT_EVENT, {
      detail: { code: event.code, repeat: event.repeat }
    }));
  }, true);

  window.addEventListener("keyup", (event) => {
    if (imeGuard?.code === event.code) {
      debug("keyup", event);
      imeGuard.expiresAt = performance.now() + 80;
    }
  }, true);

  for (const type of ["compositionstart", "compositionupdate", "compositionend", "beforeinput"]) {
    window.addEventListener(type, (event) => {
      if (
        imeGuard &&
        event.target === imeGuard.editor &&
        !event.inputType?.startsWith("delete")
      ) debug(type, event);
    }, true);
  }

  window.addEventListener("input", observeImeInput, true);

  document.addEventListener(INSERT_EVENT, (event) => {
    const { requestId, code, imageUrl } = event.detail || {};
    if (!requestId || !EMOTE_CODE_PATTERN.test(code || "")) {
      respond(requestId, false, "이모티콘 코드가 올바르지 않습니다.");
      return;
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(imageUrl);
      if (parsedUrl.protocol !== "https:") throw new Error("HTTPS required");
    } catch {
      respond(requestId, false, "이모티콘 이미지 주소가 올바르지 않습니다.");
      return;
    }

    const editor = document.activeElement;
    if (
      !(editor instanceof HTMLElement) ||
      !editor.isContentEditable ||
      !editor.closest("#aside-chatting")
    ) {
      respond(requestId, false, "치지직 채팅창에 커서를 놓아주세요.");
      return;
    }

    const emojiId = code.slice(2, -2);
    const image = document.createElement("img");
    image.src = parsedUrl.href;
    image.alt = code;
    image.width = 32;
    image.height = 32;

    window.__workingEmoticon = {
      ...(window.__workingEmoticon || {}),
      [emojiId]: image.src
    };

    editor.focus();
    insertAtCaret(editor, image);
    editor.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      cancelable: false,
      inputType: "insertReplacementText",
      data: null
    }));
    moveCaretAfter(image);
    respond(requestId, true);
  }, true);
})();
