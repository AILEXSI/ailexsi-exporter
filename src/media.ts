const videoCache = new Map<string, HTMLVideoElement>();
export function isPlayableSource(url: string | undefined): boolean {
  if (!url || url.startsWith("missing:")) return false;
  if (url.startsWith("blob:") || url.startsWith("file:")) return true;
  if (url.startsWith("http://") || url.startsWith("https://")) {
    try { return typeof location === "undefined" || new URL(url).origin === location.origin; } catch { return false; }
  }
  return false;
}
export function sanitizeFileName(name: string): string {
  const base = (name || "resonance_export").replace(/\.(mp4|webm|mov)$/i, "");
  const clean = base.replace(/[^\w\-]+/g, "_").replace(/^_+|_+$/g, "");
  return `${clean || "resonance_export"}.mp4`;
}
export async function loadVideo(src: string): Promise<HTMLVideoElement> {
  if (!isPlayableSource(src)) throw new Error("Blocked non-local media source");
  const cached = videoCache.get(src);
  if (cached && cached.readyState >= 2) return cached;
  const el = cached ?? document.createElement("video");
  el.muted = true; el.playsInline = true; el.preload = "auto"; el.crossOrigin = "anonymous";
  if (el.src !== src) el.src = src;
  videoCache.set(src, el);
  if (el.readyState >= 2) return el;
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => { cleanup(); reject(new Error("Video load timeout")); }, 8000);
    const onOk = () => { cleanup(); resolve(); };
    const onErr = () => { cleanup(); reject(new Error("Failed to load local video")); };
    const cleanup = () => { window.clearTimeout(timer); el.removeEventListener("loadeddata", onOk); el.removeEventListener("error", onErr); };
    el.addEventListener("loadeddata", onOk); el.addEventListener("error", onErr); el.load();
  });
  return el;
}
export async function seekVideo(el: HTMLVideoElement, timeSec: number) {
  const t = Math.max(0, Math.min(Number.isFinite(el.duration) ? el.duration : timeSec, timeSec));
  if (Math.abs(el.currentTime - t) < 1 / 60) return;
  el.currentTime = t;
  await new Promise<void>((resolve) => {
    let settled = false;
    const done = () => { if (settled) return; settled = true; el.removeEventListener("seeked", done); resolve(); };
    el.addEventListener("seeked", done);
    window.setTimeout(done, 70);
  });
}
export async function decodeAudio(src: string): Promise<AudioBuffer> {
  if (!isPlayableSource(src)) throw new Error("Blocked non-local audio source");
  const res = await fetch(src);
  if (!res.ok) throw new Error("Audio fetch failed");
  const ctx = new OfflineAudioContext(2, 44100, 44100);
  return ctx.decodeAudioData((await res.arrayBuffer()).slice(0));
}
export function clearMediaCache() {
  for (const v of videoCache.values()) { try { v.pause(); v.removeAttribute("src"); v.load(); } catch { /* */ } }
  videoCache.clear();
}
