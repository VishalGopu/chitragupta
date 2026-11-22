import { describe, expect, it } from "vitest";
import { encodeWav } from "@/lib/voice";

const decode = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

describe("encodeWav", () => {
  it("writes a 16 kHz mono 16-bit PCM header and downsamples", () => {
    const wav = decode(encodeWav([new Float32Array(48000).fill(0.5)], 48000));   // 1 s captured at 48 kHz
    const v = new DataView(wav.buffer);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...wav.slice(8, 12))).toBe("WAVE");
    expect(v.getUint16(20, true)).toBe(1);        // PCM
    expect(v.getUint16(22, true)).toBe(1);        // mono
    expect(v.getUint32(24, true)).toBe(16000);
    expect(v.getUint32(40, true)).toBe(32000);    // 1 s of 16-bit samples
  });
  it("rejects recordings that are too short", () => {
    expect(() => encodeWav([new Float32Array(1000)], 16000)).toThrow(/longer/);
  });
  it("clips samples to the 16-bit range", () => {
    const wav = decode(encodeWav([new Float32Array(16000).fill(3)], 16000));
    expect(new DataView(wav.buffer).getInt16(44, true)).toBe(32767);
  });
});
