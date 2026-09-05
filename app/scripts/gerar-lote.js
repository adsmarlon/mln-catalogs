// Gera N imagens white em paralelo (uma thread por core). JS puro, sem Python.
// Uso:  node scripts/gerar-lote.js <qtd> <pasta-destino>
// Progresso legivel por maquina no stdout:  PROGRESS <feitas>/<total>
const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");
const { Worker, isMainThread, parentPort, workerData } = require("node:worker_threads");

if (!isMainThread) {
  const { gerarPng } = require("./imagens/padrao");
  for (const { seed, caminho } of workerData.tarefas) {
    fs.writeFileSync(caminho, gerarPng(seed));
    parentPort.postMessage(1);
  }
  parentPort.close();
} else {
  const n = parseInt(process.argv[2], 10) || 300;
  const destino = process.argv[3] || "white-images";
  fs.mkdirSync(destino, { recursive: true });

  const largura = String(n).length;
  const base = (Math.random() * 0x7fffffff) | 0;
  const tarefas = Array.from({ length: n }, (_, i) => ({
    seed: base + i,
    caminho: path.join(destino, `img_${String(i + 1).padStart(largura, "0")}.png`),
  }));

  const workers = Math.max(1, Math.min(os.cpus().length, 12));
  console.log(`WORKERS ${workers}`);

  // reparte as tarefas em fatias intercaladas
  const fatias = Array.from({ length: workers }, () => []);
  tarefas.forEach((t, i) => fatias[i % workers].push(t));

  let feitas = 0;
  const passo = Math.max(1, Math.floor(n / 100));
  let vivos = 0;
  let falhou = null;

  for (const fatia of fatias) {
    if (!fatia.length) continue;
    vivos++;
    const w = new Worker(__filename, { workerData: { tarefas: fatia } });
    w.on("message", () => {
      feitas++;
      if (feitas % passo === 0 || feitas === n) console.log(`PROGRESS ${feitas}/${n}`);
    });
    w.on("error", (e) => { falhou = e; });
    w.on("exit", () => {
      if (--vivos === 0) {
        if (falhou) { console.error(String(falhou && falhou.stack || falhou)); process.exit(1); }
        if (feitas !== n) { console.error(`gerou ${feitas} de ${n}`); process.exit(1); }
        console.log(`OK ${n} ${destino}`);
      }
    });
  }
}
