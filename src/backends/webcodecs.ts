import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  QUALITY_MEDIUM,
  canEncodeAudio,
  canEncodeVideo,
} from "mediabunny";
import { clearMediaCache, decodeAudio, isPlayableSource, loadVideo, seekVideo } from "../media";
import { isValidMp4, parseBitrate } from "../mp4";
import { clipAtTime, planTimeline, type RenderPlan } from "../planner";
import type { ExportClip, ExportHooks, ExportJob, ExportResult } from "../types";

let encoderProbe: boolean | null = null;

export type AacConfig = {
  sampleRate: number;
  channels: number;
  bitrate?: number;
  useQuality?: boolean;
};

export function canUseWebCodecs(): boolean {
  return (
    typeof VideoEncoder !== "undefined" &&
    typeof VideoFrame !== "undefined" &&
    typeof OffscreenCanvas !== "undefined"
  );
}

export async function probeH264(): Promise<boolean> {
  if (encoderProbe !== null) return encoderProbe;
  try {
    encoderProbe = await canEncodeVideo("avc", { width: 1280, height: 720 });
  } catch {
    encoderProbe = canUseWebCodecs();
  }
  return encoderProbe;
}

export async function probeAac(): Promise<AacConfig | null> {
  const candidates: AacConfig[] = [
    { sampleRate: 44100, channels: 2, useQuality: true },
    { sampleRate: 48000, channels: 2, useQuality: true },
    { sampleRate: 44100, channels: 2, bitrate: 128_000 },
    { sampleRate: 48000, channels: 2, bitrate: 128_000 },
    { sampleRate: 48000, channels: 2, bitrate: 192_000 },
    { sampleRate: 44100, channels: 1, bitrate: 96_000 },
    { sampleRate: 22050, channels: 1, bitrate: 64_000 },
  ];
  for (const c of candidates) {
    try {
      const ok = await canEncodeAudio("aac", {
        numberOfChannels: c.channels,
        sampleRate: c.sampleRate,
        ...(c.useQuality ? { quality: QUALITY_MEDIUM } : { bitrate: c.bitrate }),
      });
      if (ok) return c;
    } catch {
      /* try next */
    }
  }
  return null;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timeout (${ms}ms)`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export async function exportWithWebCodecs(
  job: ExportJob,
  hooks: ExportHooks = {},
): Promise<ExportResult> {
  try {
    return await renderMp4(job, hooks, job.options.includeAudio !== false);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/aac|mp4a|audio|encoder configuration/i.test(msg) && job.options.includeAudio !== false) {
      hooks.onProgress?.({ percent: 8, stage: "Retrying without audio" });
      return await renderMp4(job, hooks, false);
    }
    throw e;
  }
}

async function renderMp4(
  job: ExportJob,
  hooks: ExportHooks,
  wantAudio: boolean,
): Promise<ExportResult> {
  const { onProgress, signal } = hooks;
  const plan = planTimeline(job);
  const throwIfAborted = () => {
    if (signal?.aborted) throw new Error("Export cancelled");
  };

  onProgress?.({ percent: 2, stage: "Planning timeline" });
  if (plan.durationMs < 80) return fail(job, "Timeline too short to export");

  const ok = await probeH264();
  if (!ok) return fail(job, "H.264 encoder not available in this browser");

  onProgress?.({ percent: 6, stage: "Preparing H.264 encoder" });

  const canvas = document.createElement("canvas");
  canvas.width = plan.width;
  canvas.height = plan.height;
  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
  if (!ctx) return fail(job, "Canvas 2D not available");

  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target,
  });

  const videoSource = new CanvasSource(canvas, {
    codec: "avc",
    bitrate: parseBitrate(job.options.videoBitrate, 8_000_000),
    keyFrameInterval: 2,
    sizeChangeBehavior: "contain",
  });
  output.addVideoTrack(videoSource, { frameRate: plan.fps });

  const aac = wantAudio && plan.includeAudio ? await probeAac() : null;
  let mixedAudio: AudioBuffer | null = null;
  if (aac) {
    onProgress?.({ percent: 10, stage: "Mixing audio" });
    mixedAudio = await mixAudio(plan, aac, signal);
  }

  if (mixedAudio && aac) {
    const audioSource = new AudioBufferSource({
      codec: "aac",
      ...(aac.useQuality
        ? { quality: QUALITY_MEDIUM }
        : { bitrate: aac.bitrate ?? parseBitrate(job.options.audioBitrate, 128_000) }),
    });
    output.addAudioTrack(audioSource);
    await output.start();
    await audioSource.add(mixedAudio);
  } else {
    await output.start();
  }

  const frameDur = 1 / plan.fps;
  const total = plan.frameCount;
  const budget = Math.max(25_000, plan.durationMs * 5 + 15_000);

  try {
    await withTimeout(
      encodeFrames({
        plan,
        ctx,
        canvas,
        videoSource,
        frameDur,
        total,
        onProgress,
        throwIfAborted,
      }),
      budget,
      "H.264 encode",
    );

    onProgress?.({ percent: 94, stage: "Muxing MP4" });
    await withTimeout(output.finalize(), 12_000, "MP4 mux");
  } catch (e) {
    try {
      await withTimeout(output.finalize(), 2_000, "mux abort");
    } catch {
      /* */
    }
    clearMediaCache();
    if (signal?.aborted) return fail(job, "Export cancelled");
    throw e;
  }

  clearMediaCache();

  const buffer = target.buffer;
  if (!buffer || buffer.byteLength < 800) {
    return fail(job, "Encoder produced an empty file");
  }
  if (!isValidMp4(buffer)) {
    return fail(job, "Encoder did not produce a valid MP4 (ftyp missing)");
  }

  const blob = new Blob([buffer], { type: "video/mp4" });
  onProgress?.({ percent: 100, stage: "Done" });

  return {
    outputPath: job.options.outputPath || "export.mp4",
    durationMs: plan.durationMs,
    fileSizeBytes: blob.size,
    success: true,
    blob,
    backend: "webcodecs",
  };
}

async function encodeFrames(args: {
  plan: RenderPlan;
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  videoSource: CanvasSource;
  frameDur: number;
  total: number;
  onProgress?: ExportHooks["onProgress"];
  throwIfAborted: () => void;
}) {
  const { plan, ctx, canvas, videoSource, frameDur, total, onProgress, throwIfAborted } = args;
  let lastClipId: string | null = null;
  let lastEl: HTMLVideoElement | null = null;

  for (let i = 0; i < total; i++) {
    throwIfAborted();
    const tMs = (i / plan.fps) * 1000;
    const clip = clipAtTime(plan.videoTracks, tMs);

    lastEl = await paintFrame(ctx, canvas, clip, tMs, lastClipId, lastEl);
    lastClipId = clip?.id ?? null;
    await videoSource.add(i * frameDur, frameDur);

    if (i % 4 === 0) await yieldTick();

    if (i % 6 === 0 || i === total - 1) {
      const pct = 14 + Math.round((i / Math.max(1, total)) * 78);
      onProgress?.({
        percent: Math.min(92, pct),
        stage: "Encoding H.264",
        currentTimeMs: tMs,
      });
    }
  }
}

function yieldTick(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

async function paintFrame(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  clip: ExportClip | null,
  tMs: number,
  lastClipId: string | null,
  lastEl: HTMLVideoElement | null,
): Promise<HTMLVideoElement | null> {
  ctx.fillStyle = "#050608";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!clip || !isPlayableSource(clip.sourcePath)) return lastEl;

  try {
    const el = lastClipId === clip.id && lastEl ? lastEl : await loadVideo(clip.sourcePath);
    const srcIn = clip.sourceInMs ?? 0;
    const targetSec = (srcIn + (tMs - clip.startMs)) / 1000;
    const sequential = lastClipId === clip.id && Math.abs(el.currentTime - targetSec) < 0.08;
    if (!sequential) await seekVideo(el, targetSec);
    else if (Math.abs(el.currentTime - targetSec) > 1 / 90) el.currentTime = targetSec;
    if (el.videoWidth < 2) return el;
    const scale = Math.min(canvas.width / el.videoWidth, canvas.height / el.videoHeight);
    const w = el.videoWidth * scale;
    const h = el.videoHeight * scale;
    ctx.drawImage(el, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    return el;
  } catch {
    return lastEl;
  }
}

async function mixAudio(
  plan: RenderPlan,
  aac: AacConfig,
  signal?: AbortSignal,
): Promise<AudioBuffer | null> {
  const sampleRate = aac.sampleRate;
  const channels = aac.channels;
  const length = Math.max(1, Math.ceil((plan.durationMs / 1000) * sampleRate));
  const ctx = new OfflineAudioContext(channels, length, sampleRate);

  const dedicated = plan.audioTracks.flatMap((t) => t.clips);
  const clips: ExportClip[] =
    dedicated.length > 0 ? dedicated : plan.videoTracks.flatMap((t) => t.clips);

  let added = 0;
  for (const clip of clips) {
    if (signal?.aborted) throw new Error("Export cancelled");
    if (!isPlayableSource(clip.sourcePath)) continue;
    try {
      const decoded = await decodeAudio(clip.sourcePath);
      const src = ctx.createBufferSource();
      src.buffer = decoded;
      src.connect(ctx.destination);
      const offset = Math.max(0, clip.startMs / 1000);
      const srcIn = (clip.sourceInMs ?? 0) / 1000;
      const playDur = Math.max(0.01, (clip.endMs - clip.startMs) / 1000);
      src.start(offset, srcIn, playDur);
      added++;
    } catch {
      /* skip broken / silent sources */
    }
  }
  if (!added) return null;
  return ctx.startRendering();
}

function fail(job: ExportJob, error: string): ExportResult {
  return {
    outputPath: job.options.outputPath,
    durationMs: job.timeline.durationMs,
    fileSizeBytes: 0,
    success: false,
    error,
    backend: "webcodecs",
  };
}
