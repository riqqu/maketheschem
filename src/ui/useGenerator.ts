import { useCallback, useEffect, useRef, useState } from 'react';
import type { BackgroundOptions } from '../core/background';
import type { DitherKind, PaletteColor } from '../core/quantize';
import type { RGBAImage, ResizeMode } from '../core/resample';
import type { BackgroundInfo, WorkerRequest, WorkerResponse } from '../worker/generate.worker';

export interface GenerateRequest {
  width: number;
  height: number;
  resize: ResizeMode;
  dither: number;
  ditherMode: DitherKind;
  palette: PaletteColor[];
  maxTypes: number;
  background: BackgroundOptions | null;
}

export interface GenerateResult {
  width: number;
  height: number;
  cells: Uint16Array;
  background: BackgroundInfo | null;
}

export interface MaskRequest {
  width: number;
  height: number;
  resize: ResizeMode;
  background: BackgroundOptions;
}

export interface MaskResult {
  mask: Uint8Array;
  background: BackgroundInfo;
}

/** Owns the generation worker. Only the newest request's result is delivered. */
export function useGenerator() {
  const workerRef = useRef<Worker | null>(null);
  const sourceRef = useRef<RGBAImage | null>(null);
  const latest = useRef(0);
  const callbacks = useRef(new Map<number, (msg: WorkerResponse) => void>());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const postSource = (worker: Worker, image: RGBAImage | null) => {
    const copy = image ? { width: image.width, height: image.height, data: image.data.slice() } : null;
    const msg: WorkerRequest = { type: 'source', image: copy };
    worker.postMessage(msg, copy ? [copy.data.buffer] : []);
  };

  useEffect(() => {
    const worker = new Worker(new URL('../worker/generate.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      const cb = callbacks.current.get(msg.id);
      callbacks.current.delete(msg.id);
      if (msg.id !== latest.current) return;
      setBusy(false);
      if (msg.type === 'error') setError(msg.message);
      else {
        setError(null);
        cb?.(msg);
      }
    };
    // A restarted worker (hot reload, StrictMode) must get the current image again.
    if (sourceRef.current) postSource(worker, sourceRef.current);
    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  const setSource = useCallback((image: RGBAImage | null) => {
    sourceRef.current = image;
    if (workerRef.current) postSource(workerRef.current, image);
  }, []);

  const send = (msg: WorkerRequest & { id: number }, cb: (msg: WorkerResponse) => void) => {
    callbacks.current.clear();
    callbacks.current.set(msg.id, cb);
    setBusy(true);
    workerRef.current?.postMessage(msg);
  };

  const generate = useCallback((req: GenerateRequest, onResult: (r: GenerateResult) => void) => {
    const id = ++latest.current;
    send({ type: 'generate', id, ...req }, (msg) => {
      if (msg.type === 'result') onResult({ width: msg.width, height: msg.height, cells: msg.cells, background: msg.background });
    });
  }, []);

  const backgroundMask = useCallback((req: MaskRequest, onResult: (r: MaskResult) => void) => {
    const id = ++latest.current;
    send({ type: 'mask', id, ...req }, (msg) => {
      if (msg.type === 'mask') onResult({ mask: msg.mask, background: msg.background });
    });
  }, []);

  /** Drops the result of any request still running (e.g. for an image that is no longer shown). */
  const cancel = useCallback(() => {
    latest.current++;
    callbacks.current.clear();
    setBusy(false);
  }, []);

  return { setSource, generate, backgroundMask, cancel, busy, error };
}
