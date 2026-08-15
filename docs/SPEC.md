# Exporter SPEC V1.2

## Job

See `src/types.ts` — `ExportJob`, `RenderOptions`, `ExportProgress`, `ExportResult`.

`format` is always `"mp4"`. Width/height are forced even. FPS is clamped to 1–60.

## Planning

`planTimeline` collects cut points from every clip edge plus `0` and `durationMs`.
Each segment gets:

- topmost VIDEO clip (last track wins)
- every AUDIO clip that covers the midpoint

Missing `sourcePath` / `missing:*` are listed in `plan.missingSources` (non-fatal; those frames stay black).

IN/OUT ranges are applied in `jobFromProject` by shifting `startMs` and advancing `sourceInMs`.

## Browser (webcodecs)

1. Probe `canEncodeVideo("avc")`.
2. Probe AAC (`canEncodeAudio`) across quality/bitrate/rate/channel candidates. Mix AUDIO clips, else VIDEO sources, at the probed rate. If no AAC encoder exists, export video-only MP4 (still `ftyp` + H.264). Retry once without audio if the encoder throws.
3. Composite each frame onto a canvas (letterbox, `#050608`).
4. Sequential seek on the same clip; hard seek on cut.
5. Yield to the event loop every 4 frames so the UI can paint progress.
6. Mux with Mediabunny `Mp4OutputFormat({ fastStart: "in-memory" })`.
7. Validate `ftyp`. Empty or WebM → fail.

Watchdog = `max(25s, 5× duration + 15s)` for encode, 12s for mux.
Outer watchdog = `max(30s, 6× duration + 20s)`.

Progress stages (never “MP4 convert”):

| % | Stage |
|---|--------|
| 0 | Validating job |
| 2 | Planning timeline |
| 6 | Preparing H.264 encoder |
| 10 | Mixing audio |
| 14–92 | Encoding H.264 |
| 94 | Muxing MP4 |
| 100 | Done |

## Desktop (ffmpeg)

System `ffmpeg`, `spawn` argv only.

- 1 clip: `-ss` / `-t` / `-i` + optional audio input
- 2–12 clips: `filter_complex` scale/pad + `concat`
- `-c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p`
- `-c:a aac -movflags +faststart`
- Progress parsed from stderr `time=`
- Abort → `SIGKILL`
- `blob:` sources are rejected (use webcodecs)

## Errors

| Condition | `result.error` |
|-----------|----------------|
| No tracks | No tracks to export |
| Short timeline | Nothing to render |
| Abort | Export cancelled |
| Empty mux | Encoder produced an empty file |
| Bad container | Encoder did not produce a valid MP4 (ftyp missing) |
| Remote URL | Blocked non-local media source |
| Watchdog | Export watchdog timeout |
| No H.264 | H.264 encoder not available in this browser |
| Unsafe path | Unsafe media or output path |

## Non-goals

- Cloud render
- ffmpeg.wasm
- Mutating the project
- Shelling out (`shell: true`)
