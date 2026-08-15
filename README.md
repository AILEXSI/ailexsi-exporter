# AILEXSI Exporter

**Standalone Blueprint** for rendering a finished timeline to MP4 (and later other formats).

Local-first. No cloud rendering.

---

## Status

| Item | Status |
|------|--------|
| Repository | Created |
| Input Contract | Defined |
| Output Targets | MP4 primary |
| Implementation | Blueprint only |
| Backend | FFmpeg / native preferred |

**Version:** `0.1.0-blueprint`

---

## Purpose

Take a resolved timeline (including any accepted AI-Regie track) + the referenced media files and produce a single, playable video file.

The Exporter does **not** decide creative content. It only executes what the timeline describes.

---

## Architecture

```
ailexsi-exporter/
├── src/
│   ├── types/
│   │   └── export.ts            # ExportJob, RenderOptions, Progress
│   ├── planner.ts               # Turns timeline into render instructions
│   ├── backends/
│   │   ├── ffmpeg.ts            # Primary backend (CLI or linked)
│   │   └── native.ts            # Future pure-Rust path
│   └── index.ts
├── docs/
│   └── SPEC.md
├── package.json
└── README.md
```

In Tauri context the heavy work will live in Rust and be called via commands. The TypeScript side remains the clean job description layer.

---

## Input Contract

```ts
interface ExportJob {
  id: string;
  projectId: string;
  timeline: {
    durationMs: number;
    tracks: Array<{
      id: string;
      kind: "VIDEO" | "AUDIO";
      clips: Array<{
        id: string;
        startMs: number;          // on timeline
        endMs: number;
        sourcePath: string;       // absolute local path
        sourceInMs?: number;
        sourceOutMs?: number;
        // future: transform, opacity, speed…
      }>;
    }>;
  };
  options: RenderOptions;
}

interface RenderOptions {
  width: number;
  height: number;
  fps: number;
  videoBitrate?: string;          // e.g. "8M"
  audioBitrate?: string;          // e.g. "192k"
  format: "mp4";                  // later: webm, mov…
  outputPath: string;
  includeAudio: boolean;
}
```

---

## Output

- Primary: H.264 + AAC inside MP4
- Progress events (percentage + current stage)
- Final file path + basic metadata (duration, size)

---

## Rendering Strategy (V0.1)

1. **Plan** the timeline into a list of source segments + transitions (hard cuts first).
2. Use FFmpeg filter_complex or sequential segment rendering + concat.
3. Prefer a single FFmpeg invocation when possible for speed and simplicity.
4. Report progress via callbacks / events.

Later versions can add:
- Speed ramps / time remapping
- Simple opacity / crossfades
- Text overlays / markers burned in (optional)

---

## Public API (Target)

```ts
import { exportTimeline } from "@ailexsi/exporter";

const result = await exportTimeline(job, {
  onProgress: (p) => console.log(p.percent, p.stage),
});

// result.outputPath, result.durationMs, result.fileSizeBytes
```

In Tauri the same job description is sent to a Rust command that owns the FFmpeg process.

---

## Design Rules

- Exporter never changes the project.
- All media paths must be local and accessible.
- Failures are reported cleanly (missing file, unsupported codec, disk full…).
- Deterministic: same job → same visual result (within encoder tolerances).

---

## Related Repos

- `ailexsi-decoder` — can supply frames / metadata
- `ailexsi-regisseur` — produces the track that often gets exported
- `ailexsi-resonance-studio` — UI that triggers export and shows progress

---

**Blueprint status: Ready for implementation (FFmpeg path first).**
