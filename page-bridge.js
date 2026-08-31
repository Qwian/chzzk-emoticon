(() => {
  if (window.__chzzkCapsEmoteBridgeInstalled) return;
  window.__chzzkCapsEmoteBridgeInstalled = true;

  const INSERT_EVENT = "chzzk-caps-emote:insert";
  const RESULT_EVENT = "chzzk-caps-emote:result";
  const CONFIG_EVENT = "chzzk-caps-emote:config";
  const SHORTCUT_EVENT = "chzzk-caps-emote:shortcut";
  const DEBUG_EVENT = "chzzk-caps-emote:debug";
  const EXTENSION_INPUT_EVENT = "chzzk-caps-emote:extension-input";
  const EMOTE_CODE_PATTERN = /^\{:[^{}]+:}$/;
  let shortcutCodes = new Set();
  let imeGuard = null;
  let diagnosticsEnabled = false;
  let extensionInputDepth = 0;

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
    if (imeGuard?.cleanupTimer) window.clearTimeout(imeGuard.cleanupTimer);
    imeGuard?.observer?.disconnect();
    const pendingMutations = [];
    const observer = new MutationObserver((records) => {
      pendingMutations.push(...records);
    });
    observer.observe(editor, {
      subtree: true,
      childList: true,
      characterData: true,
      characterDataOldValue: true
    });
    const guard = {
      editor,
      code,
      expiresAt: performance.now() + 300,
      reclassifiedInputUntil: performance.now() + 24,
      observer,
      pendingMutations,
      safeRange: captureSelectionRange(editor)
    };
    imeGuard = guard;
    scheduleGuardCleanup(guard);
  }

  function scheduleGuardCleanup(guard) {
    window.clearTimeout(guard.cleanupTimer);
    const delay = Math.max(0, guard.expiresAt - performance.now()) + 20;
    guard.cleanupTimer = window.setTimeout(() => {
      if (imeGuard !== guard) return;
      if (performance.now() <= guard.expiresAt) {
        scheduleGuardCleanup(guard);
        return;
      }
      guard.observer.disconnect();
      imeGuard = null;
    }, delay);
  }

  function captureSelectionRange(editor) {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return null;
    const range = selection.getRangeAt(0);
    return editor.contains(range.commonAncestorContainer) ? range.cloneRange() : null;
  }

  function restoreSelectionRange(editor, range) {
    const selection = window.getSelection();
    if (!selection || !range || !editor.contains(range.commonAncestorContainer)) return;
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function dispatchShortcut(code, repeat) {
    document.dispatchEvent(new CustomEvent(SHORTCUT_EVENT, {
      detail: { code, repeat }
    }));
  }

  function observeGuard(guard) {
    guard.observer.observe(guard.editor, {
      subtree: true,
      childList: true,
      characterData: true,
      characterDataOldValue: true
    });
  }

  function markImeSafePoint(editor) {
    const guard = imeGuard;
    if (!guard || guard.editor !== editor) return;
    guard.pendingMutations.length = 0;
    guard.observer.takeRecords();
    guard.safeRange = captureSelectionRange(editor);
  }

  function isGuardedImeEvent(event) {
    return Boolean(
      imeGuard &&
      performance.now() <= imeGuard.expiresAt &&
      event.target === imeGuard.editor &&
      (
        event.type.startsWith("composition") ||
        event.isComposing ||
        event.inputType === "insertCompositionText"
      )
    );
  }

  function isReclassifiedImeInput(event) {
    return Boolean(
      imeGuard &&
      extensionInputDepth === 0 &&
      performance.now() <= imeGuard.reclassifiedInputUntil &&
      event.target === imeGuard.editor &&
      event.inputType === "insertText" &&
      typeof event.data === "string" &&
      event.data.length > 0
    );
  }

  function restoreRemovedNodes(record) {
    let anchor = record.nextSibling?.parentNode === record.target
      ? record.nextSibling
      : null;
    if (!anchor && record.previousSibling?.parentNode === record.target) {
      anchor = record.previousSibling.nextSibling;
    }
    for (const node of record.removedNodes) {
      record.target.insertBefore(node, anchor);
    }
  }

  function rollbackImeMutations(event) {
    const guard = imeGuard;
    const records = [...guard.pendingMutations, ...guard.observer.takeRecords()];
    guard.pendingMutations.length = 0;
    guard.observer.disconnect();

    for (const record of records.reverse()) {
      if (record.type === "characterData") {
        record.target.data = record.oldValue ?? "";
        continue;
      }
      for (const node of [...record.addedNodes].reverse()) {
        if (node.parentNode === record.target) node.remove();
      }
      restoreRemovedNodes(record);
    }

    observeGuard(guard);
    restoreSelectionRange(guard.editor, guard.safeRange);
    debug("ime-mutations-rolled-back", event, { mutationCount: records.length });
  }

  function observeInput(event) {
    const guard = imeGuard;
    if (!guard || event.target !== guard.editor || event.inputType?.startsWith("delete")) return;

    if (isGuardedImeEvent(event) || isReclassifiedImeInput(event)) {
      event.stopImmediatePropagation();
      rollbackImeMutations(event);
      return;
    }

    markImeSafePoint(guard.editor);
    debug("input-seen", event);
  }

  document.addEventListener(CONFIG_EVENT, (event) => {
    const codes = Array.isArray(event.detail?.codes) ? event.detail.codes : [];
    shortcutCodes = new Set(
      codes.filter((code) => typeof code === "string" && code.length <= 64)
    );
    diagnosticsEnabled = Boolean(event.detail?.diagnostics);
  }, true);

  document.addEventListener(EXTENSION_INPUT_EVENT, (event) => {
    extensionInputDepth = event.detail?.active
      ? extensionInputDepth + 1
      : Math.max(0, extensionInputDepth - 1);
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
    dispatchShortcut(event.code, event.repeat);
  }, true);

  window.addEventListener("keyup", (event) => {
    if (imeGuard?.code === event.code) {
      debug("keyup", event);
      imeGuard.expiresAt = performance.now() + 80;
      scheduleGuardCleanup(imeGuard);
    }
  }, true);

  for (const type of ["compositionstart", "compositionupdate", "compositionend", "beforeinput"]) {
    window.addEventListener(type, (event) => {
      if (!isGuardedImeEvent(event)) return;
      if (event.cancelable) event.preventDefault();
      event.stopImmediatePropagation();
      debug(`${type}-blocked`, event);
    }, true);
  }

  window.addEventListener("input", observeInput, true);

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
    markImeSafePoint(editor);
    respond(requestId, true);
  }, true);
})();
