import { canUseWebCodecs, exportWithWebCodecs } from "./backends/webcodecs";
import { sanitizeFileName } from "./media";
import { planTimeline } from "./planner";
import type { ExportHooks, ExportJob, ExportResult } from "./types";
export * from "./types";
export { planTimeline } from "./planner";
export { canUseWebCodecs, probeH264 } from "./backends/webcodecs";
export { jobFromProject } from "./from-project";
export { sanitizeFileName } from "./media";
export function detectBackend(): "webcodecs" | "ffmpeg" {
  if (typeof window !== "undefined" && canUseWebCodecs()) return "webcodecs";
  if (typeof process !== "undefined" && process.versions?.node) return "ffmpeg";
  return "webcodecs";
}
export async function exportTimeline(job: ExportJob, opts?: ExportHooks): Promise<ExportResult> {
  if (!job?.timeline?.tracks?.length) {
    return { outputPath: "", durationMs: 0, fileSizeBytes: 0, success: false, error: "No tracks to export" };
  }
  job.options.outputPath = sanitizeFileName(job.options.outputPath || "export");
  try {
    if (detectBackend() === "ffmpeg" && typeof window === "undefined") {
      const { exportWithFfmpeg } = await import("./backends/ffmpeg");
      return await exportWithFfmpeg(job, opts);
    }
    return await exportWithWebCodecs(job, opts);
  } catch (e) {
    return {
      outputPath: job.options.outputPath,
      durationMs: job.timeline.durationMs,
      fileSizeBytes: 0,
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
export async function saveMp4Blob(blob: Blob, fileName: string): Promise<void> {
  const name = sanitizeFileName(fileName);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 8000);
}
