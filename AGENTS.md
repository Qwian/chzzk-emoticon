# Project workflow

## Build and run

There is no build step. Load this repository root with Chrome/Edge **Load unpacked**, then reload both the extension and any open CHZZK tab after changing `manifest.json` or a content script.

## Verify changes

Run JavaScript syntax checks with the bundled Node executable:

```powershell
& 'C:\Users\shiny\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --check content.js
& 'C:\Users\shiny\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --check popup.js
Get-Content -LiteralPath 'manifest.json' -Raw | ConvertFrom-Json
```

Then verify on a logged-in CHZZK live page:

1. Save a text mapping and confirm Caps Lock plus its physical key inserts it into chat.
2. Capture a native CHZZK emote and confirm the same shortcut selects it again.
3. Confirm normal punctuation is unchanged with Caps Lock off and in non-chat text fields.
4. Test immediate sending only in a channel where sending a test message is acceptable.

## Definition of done

- Both JavaScript syntax checks pass and `manifest.json` parses.
- The unpacked extension loads without a manifest error.
- Text and native-emote mappings work on a real logged-in CHZZK live chat.
- No console error or unintended key interception is observed.

## Pitfalls

- `node` is not on PATH in this workspace; use the bundled executable above.
- Native CHZZK emote behavior depends on the current picker DOM and cannot be fully verified while logged out.
- Do not replace physical-key `KeyboardEvent.code` mappings with layout-dependent `KeyboardEvent.key` mappings.
