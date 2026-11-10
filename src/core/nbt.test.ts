import { describe, expect, it } from 'vitest';
import pnbt from 'prismarine-nbt';
import { encodeModifiedUtf8, nbt, writeNbt, writeVarInt } from './nbt';

describe('writeVarInt', () => {
  const enc = (v: number) => {
    const out: number[] = [];
    writeVarInt(out, v);
    return out;
  };
  it.each([
    [0, [0x00]],
    [1, [0x01]],
    [127, [0x7f]],
    [128, [0x80, 0x01]],
    [300, [0xac, 0x02]],
    [16383, [0xff, 0x7f]],
    [16384, [0x80, 0x80, 0x01]],
  ])('encodes %i', (value, bytes) => {
    expect(enc(value)).toEqual(bytes);
  });
});

describe('encodeModifiedUtf8', () => {
  it('passes ASCII through', () => expect([...encodeModifiedUtf8('ab:_[]=')]).toEqual([...Buffer.from('ab:_[]=')]));
  it('encodes NUL as two bytes', () => expect([...encodeModifiedUtf8('\0')]).toEqual([0xc0, 0x80]));
  it('encodes 2-byte characters like UTF-8', () => expect([...encodeModifiedUtf8('é')]).toEqual([0xc3, 0xa9]));
  it('encodes supplementary characters as surrogate pairs', () =>
    expect([...encodeModifiedUtf8('😀')]).toEqual([0xed, 0xa0, 0xbd, 0xed, 0xb8, 0x80]));
});

describe('writeNbt', () => {
  it('writes the exact bytes of a tiny compound', () => {
    const bytes = writeNbt('', nbt.compound({ a: nbt.byte(1) }));
    // TAG_Compound, name len 0, TAG_Byte, name len 1, "a", 1, TAG_End
    expect([...bytes]).toEqual([10, 0, 0, 1, 0, 1, 0x61, 1, 0]);
  });

  it('round-trips every tag type through an independent parser', async () => {
    const bytes = writeNbt('root', nbt.compound({
      b: nbt.byte(-5),
      s: nbt.short(40000),
      i: nbt.int(-123456),
      l: nbt.long(1234567890123n),
      str: nbt.string('minecraft:oak_log[axis=y]'),
      ba: nbt.byteArray(Uint8Array.from([1, 200])),
      ia: nbt.intArray([0, -1, 7]),
      emptyList: nbt.list('compound', []),
      ints: nbt.list('int', [nbt.int(1), nbt.int(2)]),
      nested: nbt.compound({ x: nbt.int(1) }),
    }));
    const { parsed, type } = await pnbt.parse(Buffer.from(bytes));
    expect(type).toBe('big');
    expect(parsed.name).toBe('root');
    const v = parsed.value as Record<string, any>;
    expect(v.b).toEqual({ type: 'byte', value: -5 });
    expect(v.s).toEqual({ type: 'short', value: 40000 - 65536 }); // unsigned shorts read back signed
    expect(v.i).toEqual({ type: 'int', value: -123456 });
    const [hi, lo] = v.l.value as [number, number];
    expect((BigInt(hi) << 32n) | BigInt(lo >>> 0)).toBe(1234567890123n);
    expect(v.str.value).toBe('minecraft:oak_log[axis=y]');
    expect(v.ba.value).toEqual([1, -56]);
    expect(v.ia.value).toEqual([0, -1, 7]);
    expect(v.emptyList.value).toEqual({ type: 'compound', value: [] });
    expect(v.ints.value).toEqual({ type: 'int', value: [1, 2] });
    expect(v.nested.value.x.value).toBe(1);
  });

  it('rejects a list with mixed element types', () => {
    expect(() => writeNbt('', nbt.compound({ l: nbt.list('int', [nbt.byte(1)]) }))).toThrow();
  });
});
