(() => {
  if (window.__chzzkCapsEmoteBridgeInstalled) return;
  window.__chzzkCapsEmoteBridgeInstalled = true;

  const INSERT_EVENT = "chzzk-caps-emote:insert";
  const RESULT_EVENT = "chzzk-caps-emote:result";
  const CONFIG_EVENT = "chzzk-caps-emote:config";
  const SHORTCUT_EVENT = "chzzk-caps-emote:shortcut";
  const EMOTE_CODE_PATTERN = /^\{:[^{}]+:}$/;
  let shortcutCodes = new Set();
  let imeGuard = null;

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

  function captureCaret(editor) {
    const selection = window.getSelection();
    const focusNode = selection?.focusNode;
    if (!focusNode || !editor.contains(focusNode)) return null;

    const path = [];
    let node = focusNode;
    while (node && node !== editor) {
      const parent = node.parentNode;
      if (!parent) return null;
      path.unshift([...parent.childNodes].indexOf(node));
      node = parent;
    }
    return { path, offset: selection.focusOffset };
  }

  function restoreCaret(editor, caret) {
    let node = editor;
    for (const index of caret?.path || []) {
      node = node.childNodes[index];
      if (!node) break;
    }
    if (!node) node = editor;

    const maxOffset = node.nodeType === Node.TEXT_NODE
      ? node.data.length
      : node.childNodes.length;
    const range = document.createRange();
    range.setStart(node, Math.min(caret?.offset || 0, maxOffset));
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function armImeGuard(editor, code) {
    imeGuard = {
      editor,
      code,
      safeHtml: editor.innerHTML,
      caret: captureCaret(editor),
      expiresAt: performance.now() + 300,
      restoring: false
    };
  }

  function updateImeGuardSnapshot(editor) {
    if (!imeGuard || imeGuard.editor !== editor) return;
    imeGuard.safeHtml = editor.innerHTML;
    imeGuard.caret = captureCaret(editor);
  }

  function restoreAfterLeakedImeInput(event) {
    const guard = imeGuard;
    if (
      !guard ||
      performance.now() > guard.expiresAt ||
      event.target !== guard.editor ||
      (event.inputType !== "insertCompositionText" && !event.isComposing)
    ) return;

    event.stopImmediatePropagation();
    if (guard.restoring) return;

    guard.restoring = true;
    try {
      guard.editor.innerHTML = guard.safeHtml;
      guard.editor.blur();
      guard.editor.focus({ preventScroll: true });
      guard.editor.innerHTML = guard.safeHtml;
      restoreCaret(guard.editor, guard.caret);
      guard.expiresAt = performance.now() + 80;
    } finally {
      guard.restoring = false;
    }
  }

  document.addEventListener(CONFIG_EVENT, (event) => {
    const codes = Array.isArray(event.detail?.codes) ? event.detail.codes : [];
    shortcutCodes = new Set(
      codes.filter((code) => typeof code === "string" && code.length <= 64)
    );
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
    document.dispatchEvent(new CustomEvent(SHORTCUT_EVENT, {
      detail: { code: event.code, repeat: event.repeat }
    }));
  }, true);

  window.addEventListener("keyup", (event) => {
    if (imeGuard?.code === event.code) {
      imeGuard.expiresAt = performance.now() + 80;
    }
  }, true);

  window.addEventListener("input", restoreAfterLeakedImeInput, true);

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
    updateImeGuardSnapshot(editor);
    respond(requestId, true);
  }, true);
})();
