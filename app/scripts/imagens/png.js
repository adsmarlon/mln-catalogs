// Codificador PNG minimo em JS puro (usa so o zlib nativo do Node).
// Cor indexada (tipo 3): 1 byte por pixel, paleta de ate 256 cores.
const zlib = require("node:zlib");

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(tipo, dados) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(dados.length, 0);
  const corpo = Buffer.concat([Buffer.from(tipo, "ascii"), dados]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo), 0);
  return Buffer.concat([len, corpo, crc]);
}

// indices: Uint8Array (w*h), paleta: [[r,g,b], ...]
function pngIndexado(indices, w, h, paleta) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 3;   // color type: indexado
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const plte = Buffer.alloc(paleta.length * 3);
  for (let i = 0; i < paleta.length; i++) {
    plte[i * 3] = paleta[i][0];
    plte[i * 3 + 1] = paleta[i][1];
    plte[i * 3 + 2] = paleta[i][2];
  }

  // scanlines com filtro 0 (None) — a imagem tem grandes areas chapadas,
  // o deflate ja resolve muito bem sem filtro
  const bruto = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) {
    bruto[y * (w + 1)] = 0;
    bruto.set(indices.subarray(y * w, y * w + w), y * (w + 1) + 1);
  }
  const idat = zlib.deflateSync(bruto, { level: 9 });

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("PLTE", plte),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

module.exports = { pngIndexado };
