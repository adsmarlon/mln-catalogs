// Gera N imagens, publica no repositorio do proprio gestor e devolve as URLs
// do jsDelivr. Responde em NDJSON streaming pra UI mostrar progresso real.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { DIR_TEMP, estado, publicar } from "../../../../lib/github";

export const maxDuration = 3600;

const GEN = process.env.IMG_GEN_SCRIPT || path.join(process.cwd(), "scripts", "gerar-lote.js");

function gerar(n, destino, onProgress) {
  return new Promise((resolve, reject) => {
    // process.execPath = o proprio Node que roda o app: nao depende de PATH
    const ps = spawn(process.execPath, [GEN, String(n), destino]);
    let buf = "";
    let err = "";
    ps.stdout.on("data", (d) => {
      buf += d.toString();
      const linhas = buf.split("\n");
      buf = linhas.pop() || "";
      for (const l of linhas) {
        const m = l.match(/^PROGRESS (\d+)\/(\d+)/);
        if (m) onProgress(Number(m[1]), Number(m[2]));
      }
    });
    ps.stderr.on("data", (d) => { err += d.toString(); });
    ps.on("error", reject);
    ps.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error("gerador falhou: " + err.slice(0, 400)))
    );
  });
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (o) => {
        try { controller.enqueue(enc.encode(JSON.stringify(o) + "\n")); } catch {}
      };
      try {
        const n = parseInt(body.count, 10);
        if (!isFinite(n) || n <= 0 || n > 5000) throw new Error("Quantidade inválida (1 a 5000).");
        if (!fs.existsSync(GEN)) throw new Error("Gerador não encontrado: " + GEN);

        const st = estado();
        if (!st.conectado) throw new Error("Conecte sua conta do GitHub antes de gerar.");

        // gera fora do repositorio; so entra nele depois de sincronizado
        const destino = path.join(DIR_TEMP, "lote_" + Date.now());

        send({ phase: "gerando", done: 0, total: n });
        await gerar(n, destino, (done, total) => send({ phase: "gerando", done, total }));

        const arquivos = fs.readdirSync(destino).filter((f) => f.endsWith(".png")).sort();
        if (arquivos.length !== n) {
          throw new Error(`Gerador produziu ${arquivos.length} de ${n} imagens.`);
        }

        send({ phase: "publicando", total: n });
        const { slug, caminho } = await publicar({ origem: destino, criativo: body.nome });

        const base = `https://cdn.jsdelivr.net/gh/${slug}@main/${caminho}`;
        send({
          phase: "pronto",
          urls: arquivos.map((f) => `${base}/${f}`),
          count: arquivos.length,
          lote: caminho,
          repo: slug,
        });
      } catch (e) {
        const msg = e?.stderr
          ? `${e.message} — ${String(e.stderr).slice(0, 300)}`
          : String(e?.message || e);
        send({ phase: "erro", error: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
