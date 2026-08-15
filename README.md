# @ailexsi/exporter

Local-first **multi-track timeline → real H.264 (+ AAC) MP4**.

| Environment | Backend |
|-------------|---------|
| Browser | WebCodecs + Mediabunny |
| Desktop / Node | System `ffmpeg` (argv-only, no shell) |

**Not** ffmpeg.wasm. **Not** MediaRecorder-as-success (that produces WebM).

## v1.2.1

- AAC probe with quality/bitrate candidates; video-only MP4 if AAC unavailable
- `ftyp` validation before success
- Encode + mux timeouts + export watchdog (no hang at 90%)
- Audio mix from AUDIO tracks, else from VIDEO sources
- Sequential video seek + media cache
- Hard fail surface — consumers must not fall through to WebM

Integrated in **AILEXSI Resonance Studio V0.4.1** (`src/core/exporter`).

## Usage

```ts
import { exportTimeline, jobFromProject, canUseWebCodecs } from "@ailexsi/exporter";

const job = jobFromProject(project, { fileName: "render", rangeStartMs, rangeEndMs });
const result = await exportTimeline(job, {
  onProgress: (p) => console.log(p.percent, p.stage),
});
if (result.success && result.blob) {
  // download result.blob as .mp4
} else {
  // show result.error — do NOT fall back to MediaRecorder WebM
}
```

## License

UNLICENSED / AILEXSI private.
