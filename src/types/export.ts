/**
 * AILEXSI Exporter — Types
 * Version: 0.1.0-blueprint
 */

export interface RenderOptions {
  width: number;
  height: number;
  fps: number;
  videoBitrate?: string;
  audioBitrate?: string;
  format: "mp4";
  outputPath: string;
  includeAudio: boolean;
}

export interface ExportClip {
  id: string;
  startMs: number;
  endMs: number;
  sourcePath: string;
  sourceInMs?: number;
  sourceOutMs?: number;
  label?: string;
}

export interface ExportTrack {
  id: string;
  kind: "VIDEO" | "AUDIO";
  clips: ExportClip[];
}

export interface ExportJob {
  id: string;
  projectId: string;
  timeline: {
    durationMs: number;
    tracks: ExportTrack[];
  };
  options: RenderOptions;
}

export interface ExportProgress {
  percent: number; // 0–100
  stage: string;
  currentTimeMs?: number;
}

export interface ExportResult {
  outputPath: string;
  durationMs: number;
  fileSizeBytes: number;
  success: boolean;
  error?: string;
}
