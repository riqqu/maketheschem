import { useCallback, useEffect, useRef, useState } from 'react';
import type { MeshData } from '../core/mesh';
import type { ModelBuildRequest, ModelBuildResult, ModelWorkerRequest, ModelWorkerResponse } from '../worker/model.worker';

/** Owns the model worker. Only the newest build's result is delivered. */
export function useModelBuilder() {
  const workerRef = useRef<Worker | null>(null);
  const sourceRef = useRef<MeshData | null>(null);
  const latest = useRef(0);
  const callback = useRef<((r: ModelBuildResult) => void) | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const worker = new Worker(new URL('../worker/model.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<ModelWorkerResponse>) => {
      const msg = e.data;
      if (msg.id !== latest.current) return;
      setBusy(false);
      if (msg.type === 'error') {
        setError(msg.message);
        return;
      }
      setError(null);
      const { type: _t, id: _i, ...result } = msg;
      callback.current?.(result);
    };
    // A restarted worker (hot reload, StrictMode) must get the current model again. Posting copies it.
    if (sourceRef.current) worker.postMessage({ type: 'source', mesh: sourceRef.current } satisfies ModelWorkerRequest);
    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  const setSource = useCallback((mesh: MeshData | null) => {
    sourceRef.current = mesh;
    latest.current++; // results for the previous model must not land
    setBusy(false);
    setError(null);
    workerRef.current?.postMessage({ type: 'source', mesh } satisfies ModelWorkerRequest);
  }, []);

  const build = useCallback((req: ModelBuildRequest, onResult: (r: ModelBuildResult) => void) => {
    const id = ++latest.current;
    callback.current = onResult;
    setBusy(true);
    workerRef.current?.postMessage({ type: 'build', id, ...req } satisfies ModelWorkerRequest);
  }, []);

  return { setSource, build, busy, error };
}
