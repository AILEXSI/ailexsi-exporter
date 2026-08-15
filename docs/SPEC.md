# Exporter SPEC V1.1

## Job
See `src/types.ts` — ExportJob, RenderOptions, ExportProgress, ExportResult.

## Planning
`planTimeline` builds cut points from clip edges, then assigns the topmost VIDEO clip and all AUDIO clips per segment.

## Browser
WebCodecs H.264 + AAC via Mediabunny. Local sources only. Sequential seek on same clip. Encode watchdog = max(30s, 6× duration + 20s). Always returns success or error — never hangs at 90%.

## Desktop
System ffmpeg, spawn with argv only. Reject unsafe paths.

## Errors
| Condition | Result.error |
|-----------|----------------|
| No tracks | No tracks to export |
| Short timeline | Nothing to render |
| Abort | Export cancelled |
| Empty mux | Encoder produced an empty file |
| Remote URL | Blocked non-local media source |
| Watchdog | Export watchdog timeout |
