import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPlayableSource, safePath, sanitizeFileName } from "../media";
import { clampFps, evenDim, isValidMp4, parseBitrate } from "../mp4";
import { planTimeline } from "../planner";
import type { ExportJob } from "../types";

function job(partial: Partial<ExportJob["timeline"]> & { width?: number; height?: number; fps?: number } = {}): ExportJob {
  return {
    id: "j1",
    projectId: "p1",
    timeline: {
      durationMs: partial.durationMs ?? 2000,
      tracks: partial.tracks ?? [
        {
          id: "v1",
          kind: "VIDEO",
          clips: [
            {
              id: "c1",
              startMs: 0,
              endMs: 2000,
              sourcePath: "blob:http://localhost/demo",
            },
          ],
        },
      ],
    },
    options: {
      width: partial.width ?? 1280,
      height: partial.height ?? 720,
      fps: partial.fps ?? 30,
      format: "mp4",
      outputPath: "out",
      includeAudio: true,
    },
  };
}

describe("sanitizeFileName", () => {
  it("forces .mp4 and strips traversal", () => {
    assert.equal(sanitizeFileName("../evil.webm"), "evil.mp4");
    assert.equal(sanitizeFileName("my video!.mp4"), "my_video.mp4");
    assert.equal(sanitizeFileName(""), "resonance_export.mp4");
  });
});

describe("isPlayableSource", () => {
  it("allows blob and file, blocks script", () => {
    assert.equal(isPlayableSource("blob:http://127.0.0.1:8080/abc"), true);
    assert.equal(isPlayableSource("file:///tmp/a.mp4"), true);
    assert.equal(isPlayableSource("javascript:alert(1)"), false);
    assert.equal(isPlayableSource("data:text/html,x"), false);
    assert.equal(isPlayableSource("missing:clip"), false);
    assert.equal(isPlayableSource(""), false);
  });
});

describe("safePath", () => {
  it("rejects injection and relative escape", () => {
    assert.equal(safePath("/home/user/out.mp4"), true);
    assert.equal(safePath("-i"), false);
    assert.equal(safePath("a;rm -rf /"), false);
    assert.equal(safePath("a|b"), false);
    assert.equal(safePath("../etc/passwd"), false);
    assert.equal(safePath("a`id`"), false);
  });
});

describe("mp4 helpers", () => {
  it("evenDim and bitrate and ftyp", () => {
    assert.equal(evenDim(1279), 1280);
    assert.equal(evenDim(720, 16, 2160), 720);
    assert.equal(clampFps(120), 60);
    assert.equal(parseBitrate("8M", 0), 8_000_000);
    assert.equal(parseBitrate("192k", 0), 192_000);
    const ftyp = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0]);
    assert.equal(isValidMp4(ftyp), true);
    const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    assert.equal(isValidMp4(webm), false);
  });
});

describe("planTimeline", () => {
  it("builds cut segments and even output size", () => {
    const p = planTimeline(
      job({
        durationMs: 3000,
        width: 1279,
        height: 721,
        tracks: [
          {
            id: "v1",
            kind: "VIDEO",
            clips: [
              { id: "a", startMs: 0, endMs: 1500, sourcePath: "blob:x" },
              { id: "b", startMs: 1500, endMs: 3000, sourcePath: "blob:y" },
            ],
          },
          {
            id: "a1",
            kind: "AUDIO",
            clips: [{ id: "s", startMs: 500, endMs: 2000, sourcePath: "blob:z" }],
          },
        ],
      }),
    );
    assert.equal(p.width, 1280);
    assert.equal(p.height, 722);
    assert.ok(p.segments.length >= 3);
    assert.equal(p.segments[0]!.video?.id, "a");
    const mid = p.segments.find((s) => s.startMs >= 500 && s.startMs < 1500);
    assert.ok(mid);
    assert.equal(mid!.audio[0]?.id, "s");
  });

  it("reports missing sources", () => {
    const p = planTimeline(
      job({
        tracks: [
          {
            id: "v1",
            kind: "VIDEO",
            clips: [{ id: "c", startMs: 0, endMs: 1000, sourcePath: "missing:gone" }],
          },
        ],
      }),
    );
    assert.ok(p.missingSources.includes("missing:gone"));
  });
});
