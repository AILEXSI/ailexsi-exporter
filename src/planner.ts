import type { ExportClip, ExportJob, ExportTrack } from "./types";
export interface PlannedSegment { startMs: number; endMs: number; video: ExportClip | null; audio: ExportClip[]; }
export interface RenderPlan {
  durationMs: number; fps: number; width: number; height: number; frameCount: number;
  includeAudio: boolean; segments: PlannedSegment[]; videoTracks: ExportTrack[]; audioTracks: ExportTrack[]; missingSources: string[];
}
export function planTimeline(job: ExportJob): RenderPlan {
  const { timeline, options } = job;
  const durationMs = Math.max(0, timeline.durationMs);
  const fps = Math.max(1, Math.min(60, options.fps || 30));
  const frameCount = Math.max(1, Math.round((durationMs / 1000) * fps));
  const videoTracks = timeline.tracks.filter((t) => t.kind === "VIDEO");
  const audioTracks = timeline.tracks.filter((t) => t.kind === "AUDIO");
  const cuts = new Set<number>([0, durationMs]);
  for (const t of timeline.tracks) for (const c of t.clips) {
    cuts.add(Math.max(0, Math.min(durationMs, c.startMs)));
    cuts.add(Math.max(0, Math.min(durationMs, c.endMs)));
  }
  const times = [...cuts].sort((a, b) => a - b);
  const segments: PlannedSegment[] = [];
  for (let i = 0; i < times.length - 1; i++) {
    const startMs = times[i]!; const endMs = times[i + 1]!;
    if (endMs - startMs < 1) continue;
    const mid = (startMs + endMs) / 2;
    segments.push({ startMs, endMs, video: topClipAt(videoTracks, mid), audio: audioTracks.map((t) => clipAt(t, mid)).filter((c): c is ExportClip => !!c) });
  }
  return { durationMs, fps, width: options.width, height: options.height, frameCount, includeAudio: options.includeAudio !== false, segments, videoTracks, audioTracks, missingSources: [] };
}
function clipAt(track: ExportTrack, timeMs: number) {
  return track.clips.find((c) => timeMs >= c.startMs && timeMs < c.endMs) ?? null;
}
function topClipAt(tracks: ExportTrack[], timeMs: number) {
  for (let i = tracks.length - 1; i >= 0; i--) { const c = clipAt(tracks[i]!, timeMs); if (c) return c; }
  return null;
}
