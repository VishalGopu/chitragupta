"use client";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { events } from "./api";
import { recordWav } from "./voice";

/** Subscribes to the backend's live-update stream for as long as the component is mounted. */
export function useEvents(handler: (e: { type: string; [k: string]: unknown }) => void) {
  const latest = useRef(handler);
  useEffect(() => { latest.current = handler; });
  useEffect(() => events((e) => latest.current(e)), []);
}

/** Runs `fn` every `ms` while mounted. */
export function useInterval(fn: () => void, ms: number) {
  const latest = useRef(fn);
  useEffect(() => { latest.current = fn; });
  useEffect(() => { const id = setInterval(() => latest.current(), ms); return () => clearInterval(id); }, [ms]);
}

/** Re-renders every second (for live timers). */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useInterval(() => setNow(Date.now()), ms);
  return now;
}

/**
 * Hold-to-talk: the returned props go on a button. Pressing (pointer, or Space/Enter) starts recording, releasing sends the WAV
 * to `onAudio`. Microphone errors go to `onError`.
 */
export function useHoldToTalk(onAudio: (wav: string) => void | Promise<void>, onError: (message: string) => void) {
  const [recording, setRecording] = useState(false);
  const release = useRef<(() => void) | null>(null);
  const audioCb = useRef(onAudio), errorCb = useRef(onError);
  useEffect(() => { audioCb.current = onAudio; errorCb.current = onError; });

  const start = useCallback(async () => {
    if (release.current) return;
    let done!: () => void; const stop = new Promise<void>((r) => (done = r));
    release.current = done; setRecording(true);
    try { const wav = await recordWav(stop); release.current = null; setRecording(false); await audioCb.current(wav); }
    catch (e) { release.current = null; setRecording(false); errorCb.current(e instanceof Error ? e.message : String(e)); }
  }, []);
  const end = useCallback(() => release.current?.(), []);
  const isKey = (e: KeyboardEvent) => e.key === " " || e.key === "Enter";

  return {
    recording,
    props: {
      onPointerDown: (e: PointerEvent) => { e.preventDefault(); void start(); },
      onPointerUp: end, onPointerLeave: end, onPointerCancel: end,
      onKeyDown: (e: KeyboardEvent) => { if (isKey(e) && !e.repeat) { e.preventDefault(); void start(); } },
      onKeyUp: (e: KeyboardEvent) => { if (isKey(e)) end(); },
    },
  };
}
