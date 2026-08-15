/**
 * AILEXSI Exporter — Public API Skeleton
 * Version: 0.1.0-blueprint
 */

import type {
  ExportJob,
  ExportProgress,
  ExportResult,
} from "./types/export";

export type ProgressCallback = (progress: ExportProgress) => void;

/**
 * Main entry point (skeleton).
 * Real implementation will call FFmpeg or native backend.
 */
export async function exportTimeline(
  job: ExportJob,
  opts?: { onProgress?: ProgressCallback }
): Promise<ExportResult> {
  const { onProgress } = opts ?? {};

  onProgress?.({ percent: 0, stage: "planning" });

  // Validate basic job
  if (!job.options.outputPath) {
    return {
      outputPath: "",
      durationMs: 0,
      fileSizeBytes: 0,
      success: false,
      error: "outputPath is required",
    };
  }

  if (job.timeline.tracks.length === 0) {
    return {
      outputPath: job.options.outputPath,
      durationMs: 0,
      fileSizeBytes: 0,
      success: false,
      error: "No tracks to export",
    };
  }

  onProgress?.({ percent: 10, stage: "validating media paths" });

  // Skeleton: we do not actually render yet
  onProgress?.({ percent: 50, stage: "render (skeleton — not implemented)" });

  // Simulate finish
  onProgress?.({ percent: 100, stage: "done (skeleton)" });

  return {
    outputPath: job.options.outputPath,
    durationMs: job.timeline.durationMs,
    fileSizeBytes: 0,
    success: false,
    error:
      "Exporter is still a blueprint skeleton. Wire FFmpeg or native backend next.",
  };
}

export * from "./types/export";
