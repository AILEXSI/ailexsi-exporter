/**
 * MP4 container helpers — even dims (H.264), bitrate parse, ftyp check.
 */

export function evenDim(n: number, min = 16, max = 3840): number {
  const x = Math.round(Number(n) || min);
  const even = x % 2 === 0 ? x : x + 1;
  return Math.max(min, Math.min(max, even));
}

export function parseBitrate(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const m = String(raw).trim().match(/^(\d+(?:\.\d+)?)([kKmM])?$/);
  if (!m) return fallback;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  const u = (m[2] || "").toLowerCase();
  if (u === "k") return Math.round(n * 1_000);
  if (u === "m") return Math.round(n * 1_000_000);
  return Math.round(n);
}

/** True if buffer starts with a valid ISO-BMFF `ftyp` box (real MP4, not WebM). */
export function isValidMp4(data: ArrayBuffer | Uint8Array): boolean {
  const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (u8.byteLength < 16) return false;
  const tag = String.fromCharCode(u8[4]!, u8[5]!, u8[6]!, u8[7]!);
  if (tag !== "ftyp") return false;
  // Reject WebM/EBML (0x1A 0x45 0xDF 0xA3)
  if (u8[0] === 0x1a && u8[1] === 0x45 && u8[2] === 0xdf && u8[3] === 0xa3) {
    return false;
  }
  return true;
}

export function clampFps(fps: number): number {
  const n = Math.round(Number(fps) || 30);
  return Math.max(1, Math.min(60, n));
}
