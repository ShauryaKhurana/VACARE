// One-off script: generates simple solid-color PWA icons (accent color,
// rounded via a plain square -- no design assets exist for this build yet)
// using only Node's built-in zlib, so no image-processing dependency is
// needed just to satisfy the manifest's icon references.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const ACCENT = [0x2b, 0x6e, 0x63]; // #2B6E63

function crc32(buf) {
  let c;
  const table = crc32.table ?? (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function makeIcon(size) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rowLen = size * 3 + 1;
  const raw = Buffer.alloc(rowLen * size);
  for (let y = 0; y < size; y++) {
    const rowStart = y * rowLen;
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const px = rowStart + 1 + x * 3;
      raw[px] = ACCENT[0];
      raw[px + 1] = ACCENT[1];
      raw[px + 2] = ACCENT[2];
    }
  }

  const idat = deflateSync(raw);

  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

writeFileSync(new URL("../public/icons/icon-192.png", import.meta.url), makeIcon(192));
writeFileSync(new URL("../public/icons/icon-512.png", import.meta.url), makeIcon(512));
console.log("Generated placeholder PWA icons.");
