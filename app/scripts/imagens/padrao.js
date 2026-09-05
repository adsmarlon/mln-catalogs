// Desenha o padrao geometrico: 1000x1000, grade 6x6, dois tons,
// triangulos em orientacao aleatoria. Antialiasing analitico na diagonal.
const { pngIndexado } = require("./png");

const TAM = 1000;
const GRADE = 6;
const NIVEIS = 32; // degraus de mistura entre as duas cores (paleta = 32 entradas)

// paletas (escuro, claro) — extraidas das imagens reais do CDN do TikTok
const PALETAS = [
  [[0xb2, 0x48, 0x04], [0xff, 0xb3, 0x82]], // laranja
  [[0x28, 0x58, 0xb2], [0x9c, 0xbe, 0xff]], // azul indigo
  [[0x00, 0x76, 0xa5], [0x7f, 0xd4, 0xf5]], // ciano
  [[0x1c, 0x7a, 0x3e], [0x9d, 0xe8, 0xb4]], // verde
  [[0x8b, 0x2d, 0x6b], [0xf7, 0xb0, 0xdc]], // magenta
  [[0x6b, 0x46, 0x9c], [0xc9, 0xb3, 0xf0]], // roxo
  [[0xa8, 0x35, 0x2a], [0xf5, 0xa8, 0x9c]], // vermelho
  [[0xb8, 0x86, 0x0b], [0xff, 0xe4, 0x8f]], // ambar
];

// gerador pseudoaleatorio deterministico (mesmo do lib/catalog.js)
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gerarPng(seed) {
  const rnd = mulberry32(seed >>> 0);
  const [escuro, claro] = PALETAS[Math.floor(rnd() * PALETAS.length)];

  // paleta: NIVEIS degraus de claro(0) -> escuro(NIVEIS-1)
  const paleta = [];
  for (let i = 0; i < NIVEIS; i++) {
    const t = i / (NIVEIS - 1);
    paleta.push([
      Math.round(claro[0] + (escuro[0] - claro[0]) * t),
      Math.round(claro[1] + (escuro[1] - claro[1]) * t),
      Math.round(claro[2] + (escuro[2] - claro[2]) * t),
    ]);
  }
  const IDX_CLARO = 0;
  const IDX_ESCURO = NIVEIS - 1;

  // sorteia a configuracao de cada celula antes de rasterizar
  const celulas = [];
  for (let i = 0; i < GRADE * GRADE; i++) {
    const modo = rnd();
    if (modo < 0.12) celulas.push({ tipo: "solido", cor: IDX_ESCURO });
    else if (modo < 0.24) celulas.push({ tipo: "solido", cor: IDX_CLARO });
    else {
      const invertido = rnd() < 0.5;
      celulas.push({
        tipo: "tri",
        canto: Math.floor(rnd() * 4),
        frente: invertido ? IDX_ESCURO : IDX_CLARO,
      });
    }
  }

  const px = new Uint8Array(TAM * TAM);
  const passo = TAM / GRADE;
  const INV_SQRT2 = 1 / Math.SQRT2;

  for (let gy = 0; gy < GRADE; gy++) {
    const y0 = Math.round(gy * passo);
    const y1 = Math.round((gy + 1) * passo);
    for (let gx = 0; gx < GRADE; gx++) {
      const x0 = Math.round(gx * passo);
      const x1 = Math.round((gx + 1) * passo);
      const c = celulas[gy * GRADE + gx];
      const s = x1 - x0;

      if (c.tipo === "solido") {
        for (let y = y0; y < y1; y++) px.fill(c.cor, y * TAM + x0, y * TAM + x1);
        continue;
      }

      for (let y = y0; y < y1; y++) {
        const v = y - y0 + 0.5;
        const linha = y * TAM;
        for (let x = x0; x < x1; x++) {
          const u = x - x0 + 0.5;
          // distancia com sinal ate a diagonal, em pixels
          let d;
          switch (c.canto) {
            case 0: d = (u + v - s) * INV_SQRT2; break;   // canto sup-esq
            case 1: d = (v - u) * INV_SQRT2; break;       // canto sup-dir
            case 2: d = (u - v) * INV_SQRT2; break;       // canto inf-esq
            default: d = (s - u - v) * INV_SQRT2; break;  // canto inf-dir
          }
          // cobertura da frente: 1 dentro, 0 fora, rampa de 1px na borda
          let cob = 0.5 - d;
          cob = cob < 0 ? 0 : cob > 1 ? 1 : cob;
          const t = c.frente === IDX_ESCURO ? cob : 1 - cob;
          px[linha + x] = Math.round(t * (NIVEIS - 1));
        }
      }
    }
  }

  return pngIndexado(px, TAM, TAM, paleta);
}

module.exports = { gerarPng, TAM };
