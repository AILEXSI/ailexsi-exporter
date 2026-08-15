import { safePath } from "../media";
import { evenDim } from "../mp4";
import { planTimeline } from "../planner";
import type { ExportClip, ExportHooks, ExportJob, ExportResult } from "../types";

/**
 * Node / desktop FFmpeg backend.
 * Browser never imports this (dynamic, window-gated).
 * Argv only — never a shell. Paths are fail-closed.
 */
export async function exportWithFfmpeg(
  job: ExportJob,
  hooks: ExportHooks = {},
): Promise<ExportResult> {
  const { onProgress, signal } = hooks;
  const plan = planTimeline(job);
  onProgress?.({ percent: 4, stage: "Planning FFmpeg graph" });

  if (typeof process === "undefined" || !process.versions?.node) {
    return fail(job, "FFmpeg backend requires Node or Tauri");
  }

  const { spawn } = await import("node:child_process");
  const { existsSync, statSync } = await import("node:fs");

  const videoClips = plan.videoTracks
    .flatMap((t) => t.clips)
    .filter((c) => isFileSource(c.sourcePath));
  if (!videoClips.length) return fail(job, "No local file video source for FFmpeg");

  const out = job.options.outputPath;
  if (!safePath(out) || videoClips.some((c) => !safePath(c.sourcePath))) {
    return fail(job, "Unsafe media or output path");
  }

  const audio = firstFile(job, "AUDIO");
  if (audio && !safePath(audio.sourcePath)) return fail(job, "Unsafe audio path");

  const args = buildArgs(job, plan.fps, videoClips, audio);
  onProgress?.({ percent: 12, stage: "Encoding with FFmpeg" });

  const budget = Math.max(30_000, plan.durationMs * 4 + 20_000);
  const code = await new Promise<number>((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    let settled = false;
    const finish = (c: number) => {
      if (settled) return;
      settled = true;
      resolve(c);
    };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("FFmpeg watchdog timeout"));
    }, budget);

    const onAbort = () => {
      child.kill("SIGKILL");
      clearTimeout(timer);
      reject(new Error("Export cancelled"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    child.stderr?.on("data", (buf: Buffer) => {
      const m = String(buf).match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (!m) return;
      const sec = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
      const pct = 12 + Math.min(82, Math.round((sec * 1000 / Math.max(1, plan.durationMs)) * 82));
      onProgress?.({ percent: pct, stage: "Encoding with FFmpeg", currentTimeMs: sec * 1000 });
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (c) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      finish(c ?? 1);
    });
  });

  if (code !== 0 || !existsSync(out)) {
    return fail(job, `ffmpeg exited ${code}`);
  }

  const size = statSync(out).size;
  if (size < 800) return fail(job, "FFmpeg produced an empty file");

  onProgress?.({ percent: 100, stage: "Done" });
  return {
    outputPath: out,
    durationMs: plan.durationMs,
    fileSizeBytes: size,
    success: true,
    backend: "ffmpeg",
  };
}

function fail(job: ExportJob, error: string): ExportResult {
  return {
    outputPath: job.options.outputPath,
    durationMs: job.timeline.durationMs,
    fileSizeBytes: 0,
    success: false,
    error,
    backend: "ffmpeg",
  };
}

function isFileSource(p: string): boolean {
  if (!p || p.startsWith("blob:") || p.startsWith("missing:")) return false;
  return safePath(p);
}

function firstFile(job: ExportJob, kind: "VIDEO" | "AUDIO"): ExportClip | null {
  for (const t of job.timeline.tracks.filter((x) => x.kind === kind)) {
    for (const c of t.clips) {
      if (isFileSource(c.sourcePath)) return c;
    }
  }
  return null;
}

function buildArgs(
  job: ExportJob,
  fps: number,
  videos: ExportClip[],
  audio: ExportClip | null,
): string[] {
  const w = evenDim(job.options.width);
  const h = evenDim(job.options.height, 16, 2160);
  const args: string[] = ["-hide_banner", "-nostdin", "-y"];

  if (videos.length === 1) {
    const v = videos[0]!;
    const dur = Math.max(0.2, (v.endMs - v.startMs) / 1000);
    args.push("-ss", ((v.sourceInMs ?? 0) / 1000).toFixed(3), "-t", dur.toFixed(3), "-i", v.sourcePath);
  } else {
    for (const v of videos.slice(0, 12)) {
      const dur = Math.max(0.05, (v.endMs - v.startMs) / 1000);
      args.push("-ss", ((v.sourceInMs ?? 0) / 1000).toFixed(3), "-t", dur.toFixed(3), "-i", v.sourcePath);
    }
    const n = Math.min(videos.length, 12);
    const scaled = Array.from({ length: n }, (_, i) => {
      return `[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps}[v${i}]`;
    }).join(";");
    const concatIn = Array.from({ length: n }, (_, i) => `[v${i}]`).join("");
    args.push("-filter_complex", `${scaled};${concatIn}concat=n=${n}:v=1:a=0[vout]`, "-map", "[vout]");
  }

  if (audio && videos.length === 1) {
    args.push(
      "-ss",
      ((audio.sourceInMs ?? 0) / 1000).toFixed(3),
      "-t",
      Math.max(0.2, (videos[0]!.endMs - videos[0]!.startMs) / 1000).toFixed(3),
      "-i",
      audio.sourcePath,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0?",
    );
  } else if (videos.length === 1) {
    args.push("-map", "0:v:0", "-map", "0:a:0?");
  }

  args.push(
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    job.options.audioBitrate || "192k",
    "-movflags",
    "+faststart",
    "-s",
    `${w}x${h}`,
    "-r",
    String(fps),
    job.options.outputPath,
  );
  return args;
}
