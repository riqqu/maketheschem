// Minimal big-endian NBT writer (Java Edition format) - only what schematics need.

export type NbtTag =
  | { type: 'byte'; value: number }
  | { type: 'short'; value: number }
  | { type: 'int'; value: number }
  | { type: 'long'; value: bigint }
  | { type: 'string'; value: string }
  | { type: 'byteArray'; value: Uint8Array }
  | { type: 'intArray'; value: readonly number[] | Int32Array }
  | { type: 'list'; elementType: NbtTag['type']; value: NbtTag[] }
  | { type: 'compound'; value: Record<string, NbtTag> };

export type NbtCompound = Extract<NbtTag, { type: 'compound' }>;

const TAG_ID: Record<NbtTag['type'], number> = {
  byte: 1, short: 2, int: 3, long: 4, byteArray: 7, string: 8, list: 9, compound: 10, intArray: 11,
};

export const nbt = {
  byte: (value: number): NbtTag => ({ type: 'byte', value }),
  short: (value: number): NbtTag => ({ type: 'short', value }),
  int: (value: number): NbtTag => ({ type: 'int', value }),
  long: (value: bigint): NbtTag => ({ type: 'long', value }),
  string: (value: string): NbtTag => ({ type: 'string', value }),
  byteArray: (value: Uint8Array): NbtTag => ({ type: 'byteArray', value }),
  intArray: (value: readonly number[] | Int32Array): NbtTag => ({ type: 'intArray', value }),
  list: (elementType: NbtTag['type'], value: NbtTag[]): NbtTag => ({ type: 'list', elementType, value }),
  compound: (value: Record<string, NbtTag>): NbtCompound => ({ type: 'compound', value }),
};

/** Java's "modified UTF-8": NUL as 0xC0 0x80, supplementary characters as two 3-byte surrogates. */
export function encodeModifiedUtf8(s: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0x01 && c <= 0x7f) out.push(c);
    else if (c <= 0x7ff) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
  }
  if (out.length > 0xffff) throw new Error('NBT string too long');
  return Uint8Array.from(out);
}

/** Appends an unsigned LEB128 varint (7 bits per byte, high bit = more follows). */
export function writeVarInt(out: number[], value: number): void {
  let v = value >>> 0;
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  out.push(v);
}

class ByteWriter {
  private buf = new Uint8Array(1024);
  private view = new DataView(this.buf.buffer);
  length = 0;

  private ensure(n: number) {
    if (this.length + n <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.length + n) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.length));
    this.buf = next;
    this.view = new DataView(next.buffer);
  }

  u8(v: number) { this.ensure(1); this.view.setUint8(this.length, v & 0xff); this.length += 1; }
  i16(v: number) { this.ensure(2); this.view.setUint16(this.length, v & 0xffff); this.length += 2; }
  i32(v: number) { this.ensure(4); this.view.setInt32(this.length, v | 0); this.length += 4; }
  i64(v: bigint) { this.ensure(8); this.view.setBigInt64(this.length, BigInt.asIntN(64, v)); this.length += 8; }
  bytes(b: Uint8Array) { this.ensure(b.length); this.buf.set(b, this.length); this.length += b.length; }
  str(s: string) { const b = encodeModifiedUtf8(s); this.i16(b.length); this.bytes(b); }
  result(): Uint8Array { return this.buf.slice(0, this.length); }
}

function writePayload(w: ByteWriter, tag: NbtTag): void {
  switch (tag.type) {
    case 'byte': w.u8(tag.value); break;
    case 'short': w.i16(tag.value); break;
    case 'int': w.i32(tag.value); break;
    case 'long': w.i64(tag.value); break;
    case 'string': w.str(tag.value); break;
    case 'byteArray': w.i32(tag.value.length); w.bytes(tag.value); break;
    case 'intArray': w.i32(tag.value.length); for (const v of tag.value) w.i32(v); break;
    case 'list':
      w.u8(TAG_ID[tag.elementType]);
      w.i32(tag.value.length);
      for (const item of tag.value) {
        if (item.type !== tag.elementType) throw new Error(`NBT list of ${tag.elementType} contains ${item.type}`);
        writePayload(w, item);
      }
      break;
    case 'compound':
      for (const [name, child] of Object.entries(tag.value)) {
        w.u8(TAG_ID[child.type]);
        w.str(name);
        writePayload(w, child);
      }
      w.u8(0); // TAG_End
      break;
  }
}

/** Serialises a named root compound (uncompressed). */
export function writeNbt(rootName: string, root: NbtCompound): Uint8Array {
  const w = new ByteWriter();
  w.u8(TAG_ID.compound);
  w.str(rootName);
  writePayload(w, root);
  return w.result();
}
