/**
 * AILEXSI Exporter 1.2.0
 * Local-first timeline → H.264 / AAC MP4. Never mutates the project.
 * Always returns success or error. Never hangs at 90%.
 */

import { canUseWebCodecs, exportWithWebCodecs, probeH264 } from "./backends/webcodecs";
import { sanitizeFileName } from "./media";
import { evenDim, clampFps } from "./mp4";
import { planTimeline } from "./planner";
import type { ExportHooks, ExportJob, ExportResult } from "./types";

export type { ProgressCallback } from "./types";
export * from "./types";
export { planTimeline } from "./planner";
export { canUseWebCodecs, probeH264, probeAac } from "./backends/webcodecs";
export { jobFromProject } from "./from-project";
export { sanitizeFileName, isPlayableSource, safePath } from "./media";
export { isValidMp4, evenDim, parseBitrate } from "./mp4";

export function detectBackend(): "webcodecs" | "ffmpeg" {
  if (typeof window !== "undefined" && canUseWebCodecs()) return "webcodecs";
  if (typeof process !== "undefined" && process.versions?.node) return "ffmpeg";
  return "webcodecs";
}

export async function exportTimeline(
  job: ExportJob,
  opts?: ExportHooks,
): Promise<ExportResult> {
  const onProgress = opts?.onProgress;
  onProgress?.({ percent: 0, stage: "Validating job" });

  if (!job?.timeline) return emptyFail(job, "Invalid export job");
  if (!job.timeline.tracks.length) return emptyFail(job, "No tracks to export");
  if (job.timeline.durationMs < 80) return emptyFail(job, "Nothing to render");

  job.options.width = evenDim(job.options.width || 1280);
  job.options.height = evenDim(job.options.height || 720, 16, 2160);
  job.options.fps = clampFps(job.options.fps || 30);
  job.options.format = "mp4";
  job.options.outputPath = sanitizeFileName(job.options.outputPath || "export");

  const plan = planTimeline(job);
  if (!plan.segments.length) return emptyFail(job, "Empty timeline plan");

  const backend = detectBackend();
  const hardMs = Math.max(30_000, plan.durationMs * 6 + 20_000);

  const run = async (): Promise<ExportResult> => {
    if (backend === "ffmpeg" && typeof window === "undefined") {
      const { exportWithFfmpeg } = await import("./backends/ffmpeg");
      return await exportWithFfmpeg(job, opts);
    }
    return await exportWithWebCodecs(job, opts);
  };

  try {
    return await Promise.race([
      run(),
      new Promise<ExportResult>((_, reject) =>
        setTimeout(() => reject(new Error("Export watchdog timeout")), hardMs),
      ),
    ]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      outputPath: job.options.outputPath || "",
      durationMs: job.timeline.durationMs,
      fileSizeBytes: 0,
      success: false,
      error: msg,
      backend,
    };
  }
}

/** Save MP4 locally via download. Picker is skipped — it often aborts mid-export. */
export async function saveMp4Blob(blob: Blob, fileName: string): Promise<void> {
  const name = sanitizeFileName(fileName);
  const file = new File([blob], name, { type: "video/mp4" });
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 15_000);
}

function emptyFail(job: ExportJob | undefined, error: string): ExportResult {
  return {
    outputPath: job?.options.outputPath || "",
    durationMs: job?.timeline.durationMs ?? 0,
    fileSizeBytes: 0,
    success: false,
    error,
  };
}
