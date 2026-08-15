# @ailexsi/exporter

Standalone, local-first renderer: **timeline + media → H.264 / AAC MP4**.

The exporter never changes the project. It only executes the timeline.

**Version:** `1.2.0`  
**Contract:** always return `success` or `error`. Never hang at 90%.  
**Cloud:** none. **ffmpeg.wasm:** not used (it hangs in Chrome).

---

## Why this exists

Browser `MediaRecorder` on Windows Chrome almost never emits MP4.  
`ffmpeg.wasm` stalls at 50–90% under COOP/COEP + worker MIME.  
Suno “just works” because the server runs system FFmpeg.

This plugin gives you the same container **locally**:

| Runtime | Backend | Codec |
|---------|---------|--------|
| Browser (Chrome / Edge / Chromium) | WebCodecs + Mediabunny | H.264 (`avc`) + AAC |
| Node / Tauri desktop | System `ffmpeg` argv-only | `libx264` + AAC + `+faststart` |
| Future sidecar | `native` stub | Rust / Tauri |

---

## Public API

```ts
import {
  exportTimeline,
  jobFromProject,
  saveMp4Blob,
  planTimeline,
  detectBackend,
  canUseWebCodecs,
} from "@ailexsi/exporter";

const job = jobFromProject(project, {
  fileName: "resonance_export",
  rangeStartMs: inPoint,
  rangeEndMs: outPoint,
  width: 1280,
  height: 720,
  fps: 30,
});

const result = await exportTimeline(job, {
  onProgress: (p) => setUi(p.percent, p.stage),
  signal: abortController.signal,
});

if (result.success && result.blob) {
  await saveMp4Blob(result.blob, result.outputPath);
} else {
  throw new Error(result.error ?? "export failed");
}
```

`ExportJob` is frozen in `src/types.ts`. The planner turns clip edges into segments, picks the **topmost VIDEO** clip and **all AUDIO** clips per cut.

---

## Design rules

1. **Local media only.** `blob:`, `file:`, same-origin `http(s)`. `javascript:`, `data:`, remote CDNs — rejected.
2. **Never hang.** Watchdog = `max(30s, 6× duration + 20s)`. Overlay callers must `finally` close UI.
3. **Real MP4.** Output is validated for an ISO-BMFF `ftyp` box. WebM is a hard fail.
4. **H.264 even dims.** Width/height are forced even (16–3840 / 16–2160). FPS clamped 1–60.
5. **Argv only.** FFmpeg is `spawn(ffmpeg, args)` — no shell, no `-` stdin, no `; | $ \` paths.
6. **Cancelable.** `AbortSignal` stops encode; FFmpeg child is `SIGKILL`’d.
7. **Audio from video.** If the timeline has no AUDIO clips, the VIDEO sources are decoded for AAC.

---

## Security

| Check | Rule |
|-------|------|
| Sources | `isPlayableSource` — local / same-origin only |
| Filenames | `sanitizeFileName` — `[A-Za-z0-9_-]`, forced `.mp4` |
| FFmpeg paths | `safePath` — reject `-`, `..`, NUL, quotes, `$`, `` ` ``, `\|`, `;`, `&` |
| Spawn | argv array, `stdio: ignore/pipe/pipe`, no `shell: true` |
| Output | `isValidMp4` — must contain `ftyp`, reject EBML/WebM |

See `docs/SPEC.md`.

---

## Package layout

```
src/index.ts              public API
src/types.ts              frozen ExportJob contract
src/planner.ts            cut-point segments
src/media.ts              local load / seek / decode
src/mp4.ts                ftyp, even dims, bitrate
src/from-project.ts       studio project → job
src/backends/webcodecs.ts browser H.264 + AAC
src/backends/ffmpeg.ts    desktop libx264
src/backends/native.ts    reserved
```

Peer dependency: `mediabunny` `^1.54.0` (browser backend only).

---

## License

UNLICENSED — © AILEXSI. All rights reserved.
