// The browser records 16 kHz mono, 16-bit PCM WAV. Reject empty or malformed
// recordings before they consume a voice request or reach the STT service.
export function wavDuration(buffer) {
  if (buffer.length < 44 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE" ||
      buffer.toString("ascii", 12, 16) !== "fmt " || buffer.readUInt16LE(20) !== 1 ||
      buffer.readUInt16LE(22) !== 1 || buffer.readUInt32LE(24) !== 16000 || buffer.readUInt16LE(34) !== 16 ||
      buffer.toString("ascii", 36, 40) !== "data" || buffer.readUInt32LE(40) < 6400 ||
      buffer.readUInt32LE(40) > buffer.length - 44) return 0;
  return buffer.readUInt32LE(40) / 32000;
}
