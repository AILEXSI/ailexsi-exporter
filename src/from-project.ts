import { sanitizeFileName } from "./media";
import type { ExportJob } from "./types";
export function jobFromProject(project: { id: string; name: string; durationMs: number; tracks: any[]; mediaAssets: { id: string; name: string; localPathOrUrl: string }[] }, opts?: { width?: number; height?: number; fps?: number; rangeStartMs?: number; rangeEndMs?: number; fileName?: string; }): ExportJob {
  const start = opts?.rangeStartMs ?? 0;
  const end = opts?.rangeEndMs ?? project.durationMs;
  const assets = new Map(project.mediaAssets.map((a) => [a.id, a]));
  return {
    id: crypto.randomUUID(), projectId: project.id,
    timeline: {
      durationMs: Math.max(0, end - start),
      tracks: project.tracks.filter((t) => t.kind === "VIDEO" || t.kind === "AUDIO").map((t) => ({
        id: t.id, kind: t.kind,
        clips: t.clips.filter((c: any) => c.range.endMs > start && c.range.startMs < end).map((c: any) => {
          const asset = c.mediaAssetId ? assets.get(c.mediaAssetId) : undefined;
          return { id: c.id, startMs: Math.max(0, c.range.startMs - start), endMs: Math.max(0, c.range.endMs - start), sourcePath: asset?.localPathOrUrl || "", sourceInMs: c.sourceRange?.startMs ?? 0, sourceOutMs: c.sourceRange?.endMs, label: c.label || asset?.name };
        }),
      })),
    },
    options: { width: opts?.width ?? 1280, height: opts?.height ?? 720, fps: opts?.fps ?? 30, format: "mp4", outputPath: sanitizeFileName(opts?.fileName || project.name || "resonance"), includeAudio: true, videoBitrate: "8M", audioBitrate: "192k" },
  };
}
