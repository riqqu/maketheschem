// gzip via the platform's (de)compression streams - available in browsers, workers and Node 18+.

async function pipe(bytes: Uint8Array, transform: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export const gzip = (bytes: Uint8Array) => pipe(bytes, new CompressionStream('gzip'));
export const gunzip = (bytes: Uint8Array) => pipe(bytes, new DecompressionStream('gzip'));

export const isGzip = (bytes: Uint8Array) => bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;

/** Decompresses gzip input and passes anything else through unchanged. */
export const maybeGunzip = (bytes: Uint8Array) => (isGzip(bytes) ? gunzip(bytes) : Promise.resolve(bytes));
