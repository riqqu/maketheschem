// Minimal big-endian NBT reader/writer (Java Edition format) - what schematics need.

export type NbtTag =
  | { type: 'byte'; value: number }
  | { type: 'short'; value: number }
  | { type: 'int'; value: number }
  | { type: 'long'; value: bigint }
  | { type: 'float'; value: number }
  | { type: 'double'; value: number }
  | { type: 'string'; value: string }
  | { type: 'byteArray'; value: Uint8Array }
  | { type: 'intArray'; value: readonly number[] | Int32Array }
  | { type: 'longArray'; value: readonly bigint[] | BigInt64Array }
  | { type: 'list'; elementType: NbtTag['type'] | 'end'; value: NbtTag[] }
  | { type: 'compound'; value: Record<string, NbtTag> };

export type NbtCompound = Extract<NbtTag, { type: 'compound' }>;

const TAG_ID: Record<NbtTag['type'] | 'end', number> = {
  end: 0, byte: 1, short: 2, int: 3, long: 4, float: 5, double: 6, byteArray: 7, string: 8, list: 9, compound: 10,
  intArray: 11, longArray: 12,
};
const TAG_TYPE = Object.fromEntries(Object.entries(TAG_ID).map(([k, v]) => [v, k])) as Record<number, NbtTag['type'] | 'end'>;

export const nbt = {
  byte: (value: number): NbtTag => ({ type: 'byte', value }),
  short: (value: number): NbtTag => ({ type: 'short', value }),
  int: (value: number): NbtTag => ({ type: 'int', value }),
  long: (value: bigint): NbtTag => ({ type: 'long', value }),
  float: (value: number): NbtTag => ({ type: 'float', value }),
  double: (value: number): NbtTag => ({ type: 'double', value }),
  string: (value: string): NbtTag => ({ type: 'string', value }),
  byteArray: (value: Uint8Array): NbtTag => ({ type: 'byteArray', value }),
  intArray: (value: readonly number[] | Int32Array): NbtTag => ({ type: 'intArray', value }),
  longArray: (value: readonly bigint[] | BigInt64Array): NbtTag => ({ type: 'longArray', value }),
  list: (elementType: NbtTag['type'] | 'end', value: NbtTag[]): NbtTag => ({ type: 'list', elementType, value }),
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

export function decodeModifiedUtf8(b: Uint8Array): string {
  const units: number[] = [];
  let s = '';
  for (let i = 0; i < b.length; ) {
    const c = b[i];
    if (c < 0x80) {
      units.push(c);
      i += 1;
    } else if ((c & 0xe0) === 0xc0) {
      units.push(((c & 0x1f) << 6) | (b[i + 1] & 0x3f));
      i += 2;
    } else {
      units.push(((c & 0x0f) << 12) | ((b[i + 1] & 0x3f) << 6) | (b[i + 2] & 0x3f));
      i += 3;
    }
    if (units.length >= 4096) {
      s += String.fromCharCode(...units);
      units.length = 0;
    }
  }
  return s + String.fromCharCode(...units);
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
  f32(v: number) { this.ensure(4); this.view.setFloat32(this.length, v); this.length += 4; }
  f64(v: number) { this.ensure(8); this.view.setFloat64(this.length, v); this.length += 8; }
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
    case 'float': w.f32(tag.value); break;
    case 'double': w.f64(tag.value); break;
    case 'string': w.str(tag.value); break;
    case 'byteArray': w.i32(tag.value.length); w.bytes(tag.value); break;
    case 'intArray': w.i32(tag.value.length); for (const v of tag.value) w.i32(v); break;
    case 'longArray': w.i32(tag.value.length); for (const v of tag.value) w.i64(v); break;
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

// ---- reading ---------------------------------------------------------------------------------

const MAX_DEPTH = 512;

class ByteReader {
  pos = 0;
  private view: DataView;
  constructor(private readonly b: Uint8Array) {
    this.view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  }
  private need(n: number) {
    if (n < 0 || this.pos + n > this.b.length) throw new Error('Unexpected end of NBT data');
  }
  u8() { this.need(1); return this.view.getUint8(this.pos++); }
  i8() { this.need(1); return this.view.getInt8(this.pos++); }
  i16() { this.need(2); const v = this.view.getInt16(this.pos); this.pos += 2; return v; }
  u16() { this.need(2); const v = this.view.getUint16(this.pos); this.pos += 2; return v; }
  i32() { this.need(4); const v = this.view.getInt32(this.pos); this.pos += 4; return v; }
  i64() { this.need(8); const v = this.view.getBigInt64(this.pos); this.pos += 8; return v; }
  f32() { this.need(4); const v = this.view.getFloat32(this.pos); this.pos += 4; return v; }
  f64() { this.need(8); const v = this.view.getFloat64(this.pos); this.pos += 8; return v; }
  bytes(n: number) { this.need(n); const v = this.b.slice(this.pos, this.pos + n); this.pos += n; return v; }
  str() { return decodeModifiedUtf8(this.bytes(this.u16())); }
  count(width: number) {
    const n = this.i32();
    if (n < 0) throw new Error('Negative NBT length');
    this.need(n * width);
    return n;
  }
}

function readPayload(r: ByteReader, type: NbtTag['type'], depth: number): NbtTag {
  if (depth > MAX_DEPTH) throw new Error('NBT nested too deeply');
  switch (type) {
    case 'byte': return { type, value: r.i8() };
    case 'short': return { type, value: r.i16() };
    case 'int': return { type, value: r.i32() };
    case 'long': return { type, value: r.i64() };
    case 'float': return { type, value: r.f32() };
    case 'double': return { type, value: r.f64() };
    case 'string': return { type, value: r.str() };
    case 'byteArray': return { type, value: r.bytes(r.count(1)) };
    case 'intArray': {
      const n = r.count(4);
      const v = new Int32Array(n);
      for (let i = 0; i < n; i++) v[i] = r.i32();
      return { type, value: v };
    }
    case 'longArray': {
      const n = r.count(8);
      const v = new BigInt64Array(n);
      for (let i = 0; i < n; i++) v[i] = r.i64();
      return { type, value: v };
    }
    case 'list': {
      const elementType = tagType(r.u8());
      const n = r.count(elementType === 'end' ? 0 : 1);
      if (elementType === 'end') return { type, elementType, value: [] };
      const value: NbtTag[] = [];
      for (let i = 0; i < n; i++) value.push(readPayload(r, elementType, depth + 1));
      return { type, elementType, value };
    }
    case 'compound': {
      const value: Record<string, NbtTag> = {};
      for (;;) {
        const t = tagType(r.u8());
        if (t === 'end') break;
        const name = r.str();
        value[name] = readPayload(r, t, depth + 1);
      }
      return { type, value };
    }
  }
}

function tagType(id: number): NbtTag['type'] | 'end' {
  const t = TAG_TYPE[id];
  if (!t) throw new Error(`Unknown NBT tag id ${id}`);
  return t;
}

/** Parses uncompressed NBT whose root is a named compound. */
export function readNbt(bytes: Uint8Array): { name: string; root: NbtCompound } {
  const r = new ByteReader(bytes);
  if (r.u8() !== TAG_ID.compound) throw new Error('NBT root is not a compound');
  const name = r.str();
  const root = readPayload(r, 'compound', 0) as NbtCompound;
  return { name, root };
}

// ---- typed access helpers for parsed data ------------------------------------------------------

export function child<T extends NbtTag['type']>(
  tag: NbtCompound | undefined,
  name: string,
  type: T,
): Extract<NbtTag, { type: T }> | undefined {
  const c = tag?.value[name];
  return c && c.type === type ? (c as Extract<NbtTag, { type: T }>) : undefined;
}

/** A numeric tag (byte/short/int/long) as a number, or undefined. */
export function numberChild(tag: NbtCompound | undefined, name: string): number | undefined {
  const c = tag?.value[name];
  if (!c) return undefined;
  if (c.type === 'byte' || c.type === 'short' || c.type === 'int' || c.type === 'float' || c.type === 'double') return c.value;
  if (c.type === 'long') return Number(c.value);
  return undefined;
}
