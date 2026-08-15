# AILEXSI Exporter

Standalone, local-first renderer: **timeline + media → H.264 / AAC MP4**.

The exporter never changes the project. It only executes the timeline.

**Version:** `1.1.0`

---

## Status

| Item | Status |
|------|--------|
| Input contract | Frozen |
| Browser backend | **WebCodecs + Mediabunny** (real MP4) |
| Desktop backend | **System FFmpeg** (Node / Tauri) |
| Cloud | None |
| ffmpeg.wasm | Not used (hangs in Chrome) |

---

## Public API

```ts
import { exportTimeline, jobFromProject, saveMp4Blob } from "@ailexsi/exporter";

const result = await exportTimeline(job, {
  onProgress: (p) => console.log(p.percent, p.stage),
  signal: abortController.signal,
});

if (result.success && result.blob) {
  await saveMp4Blob(result.blob, result.outputPath);
}
```

---

## Backends

1. **webcodecs** (default in the browser)
   Hardware H.264 + AAC muxed to MP4. Sequential seeks, cancelable, hard watchdog. Local-only media.
2. **ffmpeg** (Node / Tauri) — libx264 + aac + faststart. Argv only, no shell.
3. **native** — reserved for Rust sidecar.

## Design rules

- Local media only.
- Always returns success or error. Never hang at 90%.
- Failures are explicit.
