import assert from "node:assert/strict";
import { wavDuration } from "../src/audio.js";

function wav(samples) {
  const b = Buffer.alloc(44 + samples * 2);
  b.write("RIFF", 0); b.writeUInt32LE(b.length - 8, 4); b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16000, 24); b.writeUInt32LE(32000, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write("data", 36); b.writeUInt32LE(samples * 2, 40);
  return b;
}

assert.equal(wavDuration(wav(0)), 0, "header-only recording");
assert.equal(wavDuration(wav(3199)), 0, "recording shorter than 200 ms");
assert.equal(wavDuration(wav(16000)), 1, "one second recording");
const truncated = wav(16000).subarray(0, 44);
assert.equal(wavDuration(truncated), 0, "declared data missing from upload");
const malformed = wav(16000); malformed.write("NOPE", 8);
assert.equal(wavDuration(malformed), 0, "invalid WAV header");
console.log("audio ok");
