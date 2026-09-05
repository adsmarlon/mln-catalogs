"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildCatalogCsv, parseVideos, formatPrice } from "../lib/catalog";
import { DEFAULT_BRANDS } from "../data/profiles";

/* ---------------- opcoes ---------------- */

const MOEDAS = [
  ["EUR", "€ Euro"], ["USD", "$ Dólar"], ["GBP", "£ Libra"], ["BRL", "R$ Real"],
  ["CHF", "Franco suíço"], ["PLN", "Zloty"], ["SEK", "Coroa sueca"],
  ["DKK", "Coroa dinamarquesa"], ["NOK", "Coroa norueguesa"], ["CZK", "Coroa tcheca"],
  ["RON", "Leu romeno"], ["HUF", "Florim húngaro"], ["MXN", "Peso mexicano"],
  ["CAD", "Dólar canadense"], ["AUD", "Dólar australiano"],
];
const GENEROS = [["male", "Masculino"], ["female", "Feminino"], ["unisex", "Unissex"]];
const CATEGORIAS = [
  "Home & Garden", "Health & Beauty", "Apparel & Accessories", "Sporting Goods",
  "Electronics", "Toys & Games", "Vehicles & Parts", "Business & Industrial",
  "Furniture", "Hardware", "Luggage & Bags", "Office Supplies",
].map((c) => [c, c]);
const CONDICOES = [["new", "Novo"], ["refurbished", "Recondicionado"], ["used", "Usado"]];
const DISPONIB = [["in stock", "Em estoque"], ["preorder", "Pré-venda"], ["out of stock", "Sem estoque"]];
const IDADES = [["adult", "Adulto"], ["all ages", "Todas as idades"], ["teen", "Adolescente"]];
const MODOS_TEXTO = [["invisible", "Invisível (recomendado)"], ["text", "Texto fixo"], ["empty", "Vazio"]];
const MODOS_MARCA = [["rotate", "Rodízio de nomes"], ["single", "Nome único"], ["invisible", "Invisível"]];

/* ---------------- estado inicial ---------------- */

const PADRAO = {
  creativeName: "", videosText: "", link: "",       // nunca persistem
  count: "300",
  price: "39.90", salePrice: "29.90", currency: "EUR",
  gender: "male", category: "Home & Garden",
  skuPrefix: "", age: "adult", condition: "new", availability: "in stock",
  titleMode: "invisible", titleText: "", titleLen: "50",
  descMode: "invisible", descText: "", descLen: "66",
  brandMode: "rotate", brandsText: DEFAULT_BRANDS.join(", "), brandSingle: "", brandLen: "66",
  shuffleImages: true, tagVideo: true, seed: "",
};

const NAO_PERSISTE = ["creativeName", "videosText", "link"];
const CHAVE_FORM = "mln.form.v2";
const CHAVE_HIST = "mln.hist.v1";
const LIMITE_CSV_GUARDADO = 1_500_000;

function ler(chave, alt) {
  try { const v = localStorage.getItem(chave); return v ? JSON.parse(v) : alt; }
  catch { return alt; }
}
function gravar(chave, valor) {
  try { localStorage.setItem(chave, JSON.stringify(valor)); return true; } catch { return false; }
}

function baixar(nome, texto) {
  const blob = new Blob([texto], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function nomeArquivoSeguro(s) {
  return String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim().replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_.-]/g, "")
    || "catalogo";
}
function quando(iso) {
  try {
    return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

/* ---------------- pecas de UI ---------------- */

function Chevron({ dir = "right" }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={dir === "down" ? "M6 9l6 6 6-6" : "M9 18l6-6-6-6"} />
    </svg>
  );
}
function Check() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

/* lista suspensa propria — o <select> nativo ignora tema no popup do sistema */
function Select({ value, onChange, options }) {
  const [aberto, setAberto] = useState(false);
  const [paraCima, setParaCima] = useState(false);
  const ref = useRef(null);

  // sem espaco abaixo, o menu abre pra cima em vez de vazar da tela
  useEffect(() => {
    if (!aberto || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const abaixo = window.innerHeight - r.bottom;
    setParaCima(abaixo < 320 && r.top > abaixo);
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    function fora(e) { if (ref.current && !ref.current.contains(e.target)) setAberto(false); }
    function esc(e) { if (e.key === "Escape") setAberto(false); }
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fora); document.removeEventListener("keydown", esc); };
  }, [aberto]);

  const atual = options.find((o) => o[0] === value);
  return (
    <div className="sel" ref={ref}>
      <button type="button" className="sel-trigger" data-open={aberto}
        onClick={() => setAberto((v) => !v)}>
        <span>{atual ? atual[1] : "—"}</span>
        <span className="chev"><Chevron dir="down" /></span>
      </button>
      {aberto && (
        <div className="sel-menu" data-up={paraCima} role="listbox">
          {options.map(([v, t]) => (
            <button type="button" key={v} className="sel-opt" data-sel={v === value}
              onClick={() => { onChange(v); setAberto(false); }}>
              <span>{t}</span>{v === value && <Check />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- pagina ---------------- */

export default function Page() {
  const [aba, setAba] = useState("gerar");
  const [f, setF] = useState(PADRAO);
  const [hidratado, setHidratado] = useState(false);

  const [prog, setProg] = useState(null);      // {fase, feitas, total}
  const [erro, setErro] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [hist, setHist] = useState([]);
  const [mais, setMais] = useState(false);
  const [fx, setFx] = useState({ valor: "", taxa: null, carregando: false });
  const [gh, setGh] = useState(null);           // null = ainda carregando
  const [ghFluxo, setGhFluxo] = useState(null); // {user_code, verification_uri}
  const [ghErro, setGhErro] = useState(null);

  const abortRef = useRef(null);

  useEffect(() => {
    const salvo = ler(CHAVE_FORM, {});
    for (const k of NAO_PERSISTE) delete salvo[k];
    setF((atual) => ({ ...atual, ...salvo }));
    setHist(ler(CHAVE_HIST, []));
    setHidratado(true);
    fetch("/api/github").then((r) => r.json()).then(setGh)
      .catch(() => setGh({ conectado: false, temClientId: false }));
  }, []);

  useEffect(() => {
    if (!hidratado) return;
    const guardar = { ...f };
    for (const k of NAO_PERSISTE) delete guardar[k];
    gravar(CHAVE_FORM, guardar);
  }, [f, hidratado]);

  const set = useCallback((k, v) => setF((p) => ({ ...p, [k]: v })), []);

  const qtd = Math.max(0, Math.min(parseInt(f.count, 10) || 0, 5000));
  const videos = useMemo(() => parseVideos(f.videosText, f.creativeName), [f.videosText, f.creativeName]);
  const convertidos = useMemo(() => videos.filter((v) => v.convertido).length, [videos]);
  const ocupado = !!prog;
  const podeGerar = videos.length > 0 && qtd > 0 && !ocupado && !!gh?.conectado;

  /* ---------- imagens: roda por baixo, o gestor nao precisa saber ---------- */

  async function obterImagens(n, nomeCriativo, onProgresso, onPublicando) {
    const ac = new AbortController();
    abortRef.current = ac;
    const r = await fetch("/api/images/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count: n, nome: nomeCriativo }),
      signal: ac.signal,
    });
    if (!r.body) throw new Error("Sem resposta do servidor (HTTP " + r.status + ").");

    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let urls = null;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const linhas = buf.split("\n");
      buf = linhas.pop() || "";
      for (const linha of linhas) {
        if (!linha.trim()) continue;
        let ev; try { ev = JSON.parse(linha); } catch { continue; }
        if (ev.phase === "gerando") onProgresso(ev.done, ev.total);
        else if (ev.phase === "publicando") onPublicando();
        else if (ev.phase === "pronto") urls = { urls: ev.urls, lote: ev.lote, repo: ev.repo };
        else if (ev.phase === "erro") throw new Error(ev.error);
      }
    }
    if (!urls) throw new Error("O servidor não devolveu as imagens.");
    return urls;
  }

  /* ---------- acao unica: gerar e baixar o CSV ---------- */

  async function gerarCsv() {
    setErro(null); setResultado(null);
    if (!videos.length) { setErro("Informe a URL de download do vídeo."); return; }
    if (qtd <= 0) { setErro("Informe a quantidade de produtos."); return; }

    setProg({ fase: "preparando", feitas: 0, total: qtd });
    try {
      const img = await obterImagens(
        qtd,
        f.creativeName,
        (feitas, total) => setProg({ fase: "preparando", feitas, total }),
        () => setProg({ fase: "montando", feitas: qtd, total: qtd })
      );

      setProg({ fase: "montando", feitas: qtd, total: qtd });
      await new Promise((r) => setTimeout(r, 20)); // deixa a UI pintar

      const seed = f.seed ? parseInt(f.seed, 10) >>> 0 : Math.floor(Math.random() * 2e9) >>> 0;
      const { csv, stats } = buildCatalogCsv({
        images: img.urls, count: qtd, videos,
        title: { mode: f.titleMode, text: f.titleText, len: parseInt(f.titleLen, 10) || 50 },
        description: { mode: f.descMode, text: f.descText, len: parseInt(f.descLen, 10) || 66 },
        brand: {
          mode: f.brandMode,
          names: String(f.brandsText || "").split(/[,\n]/).map((s) => s.trim()).filter(Boolean),
          single: f.brandSingle, len: parseInt(f.brandLen, 10) || 66,
        },
        link: f.link, category: f.category, gender: f.gender, age: f.age,
        condition: f.condition, availability: f.availability,
        price: f.price, currency: f.currency,
        priceString: formatPrice(f.price, f.currency),
        salePriceString: f.salePrice ? formatPrice(f.salePrice, f.currency) : "",
        skuPrefix: f.skuPrefix, seed,
        shuffleImages: f.shuffleImages, tagVideo: f.tagVideo,
      });

      const nome = `${nomeArquivoSeguro(f.creativeName || "catalogo")}.csv`;
      baixar(nome, csv);

      const registro = {
        id: String(Date.now()), nome, criativo: f.creativeName || "—",
        produtos: stats.products, moeda: f.currency, seed,
        lote: img.lote, repo: img.repo, criadoEm: new Date().toISOString(),
        csv: csv.length <= LIMITE_CSV_GUARDADO ? csv : null, tamanho: csv.length,
      };
      const novo = [registro, ...hist].slice(0, 40);
      setHist(novo);
      if (!gravar(CHAVE_HIST, novo)) {
        const leve = novo.map((h) => ({ ...h, csv: null }));
        setHist(leve); gravar(CHAVE_HIST, leve);
      }
      setResultado({ nome, stats, seed });

      // pronto pro proximo: limpa so o que muda por criativo.
      // preco, moeda, categoria e quantidade continuam como estavam.
      setF((p) => ({ ...p, creativeName: "", videosText: "", link: "" }));
      // o scroll suave nao roda com "reduzir movimento" ligado ou aba em segundo
      // plano; garante o resultado se em 600ms nao tiver subido.
      window.scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(() => { if (window.scrollY > 0) window.scrollTo(0, 0); }, 600);
    } catch (e) {
      if (e?.name !== "AbortError") setErro(String(e?.message || e));
    } finally {
      setProg(null);
      abortRef.current = null;
    }
  }

  function cancelar() { abortRef.current?.abort(); setProg(null); }

  async function conectarGithub() {
    setGhErro(null);
    try {
      const r = await fetch("/api/github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "iniciar" }),
      });
      const inicio = await r.json();
      if (inicio.error) throw new Error(inicio.error);
      setGhFluxo(inicio);

      let intervalo = (inicio.interval || 5) * 1000;
      const limite = Date.now() + (inicio.expires_in || 900) * 1000;
      for (;;) {
        if (Date.now() > limite) throw new Error("O código expirou. Tente de novo.");
        await new Promise((res) => setTimeout(res, intervalo));
        const rv = await fetch("/api/github", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acao: "verificar", device_code: inicio.device_code }),
        });
        const v = await rv.json();
        if (v.error) throw new Error(v.error);
        if (v.pendente) { if (v.intervalo) intervalo = v.intervalo * 1000; continue; }
        setGhFluxo(null);
        setGh({ conectado: true, temClientId: true, login: v.login, repo: v.repo });
        return;
      }
    } catch (e) {
      setGhFluxo(null);
      setGhErro(String(e?.message || e));
    }
  }

  async function desconectarGithub() {
    await fetch("/api/github", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "desconectar" }),
    });
    setGh({ conectado: false, temClientId: gh?.temClientId });
  }

  async function converter() {
    setFx((s) => ({ ...s, carregando: true }));
    try {
      const r = await fetch(`/api/fx?from=EUR&to=${encodeURIComponent(f.currency)}`);
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setFx((s) => ({ ...s, taxa: j.rate, carregando: false }));
      if (fx.valor) set("price", (parseFloat(String(fx.valor).replace(",", ".")) * j.rate).toFixed(2));
    } catch (e) {
      setFx((s) => ({ ...s, carregando: false }));
      setErro("Conversor: " + String(e?.message || e));
    }
  }

  function apagarHist(id) {
    const novo = hist.filter((h) => h.id !== id);
    setHist(novo); gravar(CHAVE_HIST, novo);
  }

  const pct = prog
    ? prog.fase === "montando" ? 100 : Math.round(((prog.feitas || 0) / Math.max(prog.total || 1, 1)) * 100)
    : 0;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">M</span> MLN Catalogs</div>
        <nav className="tabs">
          <button className="tab" data-active={aba === "gerar"} onClick={() => setAba("gerar")}>Gerar</button>
          <button className="tab" data-active={aba === "hist"} onClick={() => setAba("hist")}>
            Histórico{hist.length ? ` (${hist.length})` : ""}
          </button>
        </nav>
        {gh?.conectado && (
          <div className="topbar-fim">
            <span className="pill pill-ok" title={gh.repo}>● {gh.login}</span>
            <button className="btn btn-ghost btn-sm" onClick={desconectarGithub}>sair</button>
          </div>
        )}
      </header>

      <main className="main">
        {aba === "gerar" ? (
          <div className="page-enter">

            {gh && !gh.conectado && (
              <div className="card">
                <div className="card-head">
                  <h2>Conectar sua conta do GitHub</h2>
                  <p className="card-sub">
                    As imagens do catálogo ficam num repositório público seu, servido por CDN.
                    É uma vez só — depois o app lembra.
                  </p>
                </div>

                {!gh.temClientId ? (
                  <div className="alert alert-err" style={{ marginTop: 0 }}>
                    ⚠ Falta configurar o <span className="mono">GITHUB_CLIENT_ID</span> no arquivo
                    {" "}<span className="mono">.env.local</span>.
                  </div>
                ) : !ghFluxo ? (
                  <button className="btn btn-primary btn-lg" onClick={conectarGithub}>
                    Conectar GitHub
                  </button>
                ) : (
                  <div>
                    <ol className="gh-passos">
                      <li>Copie o código abaixo</li>
                      <li>
                        Abra{" "}
                        <a href={ghFluxo.verification_uri} target="_blank" rel="noreferrer"
                          style={{ color: "var(--brand)" }}>{ghFluxo.verification_uri}</a>
                      </li>
                      <li>Cole o código e autorize</li>
                    </ol>
                    <div className="gh-code">{ghFluxo.user_code}</div>
                    <div className="gh-esperando"><span className="spin" /> esperando você autorizar…</div>
                  </div>
                )}

                {ghErro && <div className="alert alert-err">⚠ {ghErro}</div>}
              </div>
            )}

            {resultado && (
              <div className="alert alert-ok alert-topo">
                <span>
                  ✓ <b>{resultado.nome}</b> baixado — {resultado.stats.products} produtos ·
                  {" "}{resultado.stats.columns} colunas · {resultado.stats.priceString}.
                  {" "}Está no <button className="btn btn-ghost btn-sm" style={{ padding: "0 4px", color: "inherit", textDecoration: "underline" }}
                    onClick={() => setAba("hist")}>histórico</button>.
                </span>
                <button className="alert-x" onClick={() => setResultado(null)} aria-label="fechar">×</button>
              </div>
            )}

            <div className="card">
              <div className="card-head">
                <h2><span className="step" data-done={videos.length > 0}>1</span>Criativo</h2>
              </div>

              <div className="field">
                <label>Nome do criativo</label>
                <input type="text" value={f.creativeName} autoComplete="off"
                  onChange={(e) => set("creativeName", e.target.value)} />
              </div>

              <div className="field">
                <label>URL de download do vídeo</label>
                <textarea value={f.videosText} rows={2} autoComplete="off"
                  onChange={(e) => set("videosText", e.target.value)} />
                {convertidos > 0 && (
                  <p className="hint" style={{ color: "var(--brand)" }}>
                    ✓ {convertidos === 1
                        ? "link do Drive convertido para download direto"
                        : `${convertidos} links do Drive convertidos para download direto`}
                  </p>
                )}
                <p className="hint">
                  {videos.length > 1
                    ? `${videos.length} vídeos — os produtos são divididos igualmente entre eles.`
                    : "Cole o link do Drive ou um link direto. O arquivo precisa estar público e abaixo de ~100 MB."}
                </p>
              </div>

              <div className="field">
                <label>Quantidade de produtos</label>
                <input type="number" min="1" max="5000" value={f.count}
                  onChange={(e) => set("count", e.target.value)} />
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <h2><span className="step" data-done={!!f.link}>2</span>Produto</h2>
              </div>

              <div className="field">
                <label>URL do produto (landing page)</label>
                <input type="text" value={f.link} autoComplete="off"
                  onChange={(e) => set("link", e.target.value)} />
              </div>

              <div className="row-3">
                <div className="field">
                  <label>Preço</label>
                  <input type="text" value={f.price} onChange={(e) => set("price", e.target.value)} />
                </div>
                <div className="field">
                  <label>Preço promocional</label>
                  <input type="text" value={f.salePrice} onChange={(e) => set("salePrice", e.target.value)} />
                </div>
                <div className="field">
                  <label>Moeda</label>
                  <Select value={f.currency} onChange={(v) => set("currency", v)} options={MOEDAS} />
                </div>
              </div>

              <div className="row">
                <div className="field">
                  <label>Gênero</label>
                  <Select value={f.gender} onChange={(v) => set("gender", v)} options={GENEROS} />
                </div>
                <div className="field">
                  <label>Categoria</label>
                  <Select value={f.category} onChange={(v) => set("category", v)} options={CATEGORIAS} />
                </div>
              </div>

              <div style={{ marginTop: 6 }}>
                <label className="check" data-on={f.shuffleImages}>
                  <input type="checkbox" checked={f.shuffleImages}
                    onChange={(e) => set("shuffleImages", e.target.checked)} />
                  <span className="check-body">
                    <span className="check-title">Embaralhar ordem das imagens</span>
                    <span className="check-desc">Padrão novo entre catálogos, evita repetir a mesma sequência.</span>
                  </span>
                </label>
                <label className="check" data-on={f.tagVideo}>
                  <input type="checkbox" checked={f.tagVideo}
                    onChange={(e) => set("tagVideo", e.target.checked)} />
                  <span className="check-body">
                    <span className="check-title">Marcar <span className="mono">custom_label_0</span> com o nome do criativo</span>
                    <span className="check-desc">Permite ver no report do TikTok qual criativo cada produto usou.</span>
                  </span>
                </label>
              </div>
            </div>

            <div className="disclosure">
              <button className="disclosure-btn" onClick={() => setMais((v) => !v)}>
                <span className="chevron" data-open={mais}><Chevron /></span>
                Mais definições
                <span style={{ flex: 1 }} />
                <span className="hint" style={{ margin: 0 }}>título, descrição, marca, sku, seed</span>
              </button>

              {mais && (
                <div className="disclosure-body">
                  <div className="sub-head">Título &amp; descrição</div>
                  <div className="row">
                    <div className="field">
                      <label>Título</label>
                      <Select value={f.titleMode} onChange={(v) => set("titleMode", v)} options={MODOS_TEXTO} />
                      {f.titleMode === "text" && (
                        <input type="text" style={{ marginTop: 10 }} value={f.titleText}
                          onChange={(e) => set("titleText", e.target.value)} placeholder="texto do título" />
                      )}
                      {f.titleMode === "invisible" && (
                        <input type="number" style={{ marginTop: 10 }} value={f.titleLen}
                          onChange={(e) => set("titleLen", e.target.value)} />
                      )}
                    </div>
                    <div className="field">
                      <label>Descrição</label>
                      <Select value={f.descMode} onChange={(v) => set("descMode", v)} options={MODOS_TEXTO} />
                      {f.descMode === "text" && (
                        <textarea style={{ marginTop: 10 }} value={f.descText}
                          onChange={(e) => set("descText", e.target.value)} placeholder="texto da descrição" />
                      )}
                      {f.descMode === "invisible" && (
                        <input type="number" style={{ marginTop: 10 }} value={f.descLen}
                          onChange={(e) => set("descLen", e.target.value)} />
                      )}
                    </div>
                  </div>

                  <div className="sub-head">Marca</div>
                  <div className="field">
                    <Select value={f.brandMode} onChange={(v) => set("brandMode", v)} options={MODOS_MARCA} />
                  </div>
                  {f.brandMode === "rotate" && (
                    <div className="field">
                      <label>Nomes (separados por vírgula)</label>
                      <textarea value={f.brandsText} rows={2} onChange={(e) => set("brandsText", e.target.value)} />
                    </div>
                  )}
                  {f.brandMode === "single" && (
                    <div className="field">
                      <label>Nome da marca</label>
                      <input type="text" value={f.brandSingle} onChange={(e) => set("brandSingle", e.target.value)} />
                    </div>
                  )}

                  <div className="sub-head">Feed</div>
                  <div className="row-3">
                    <div className="field">
                      <label>Idade</label>
                      <Select value={f.age} onChange={(v) => set("age", v)} options={IDADES} />
                    </div>
                    <div className="field">
                      <label>Condição</label>
                      <Select value={f.condition} onChange={(v) => set("condition", v)} options={CONDICOES} />
                    </div>
                    <div className="field">
                      <label>Disponibilidade</label>
                      <Select value={f.availability} onChange={(v) => set("availability", v)} options={DISPONIB} />
                    </div>
                  </div>
                  <div className="row">
                    <div className="field">
                      <label>Prefixo do SKU</label>
                      <input type="text" value={f.skuPrefix} placeholder="ex: FR_"
                        onChange={(e) => set("skuPrefix", e.target.value)} />
                    </div>
                    <div className="field">
                      <label>Seed (vazio = aleatório)</label>
                      <input type="text" value={f.seed} onChange={(e) => set("seed", e.target.value)} />
                    </div>
                  </div>

                  <div className="sub-head">Converter preço de euro</div>
                  <div className="row">
                    <div className="field">
                      <label>Valor em €</label>
                      <input type="text" value={fx.valor}
                        onChange={(e) => setFx((s) => ({ ...s, valor: e.target.value }))} />
                    </div>
                    <div className="field">
                      <label>&nbsp;</label>
                      <button className="btn btn-block" onClick={converter} disabled={fx.carregando}>
                        {fx.carregando ? <><span className="spin" /> convertendo…</> : `Converter para ${f.currency}`}
                      </button>
                      {fx.taxa && <p className="hint">1 € = {fx.taxa} {f.currency}</p>}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {prog && (
              <div className="card">
                <div className="progress-wrap" style={{ marginTop: 0 }}>
                  <div className="progress-head">
                    <span className="progress-label">
                      {prog.fase === "preparando" ? "Preparando catálogo…" : "Montando o CSV…"}
                    </span>
                    <span className="progress-pct">{prog.fase === "montando" ? "quase lá" : `${pct}%`}</span>
                  </div>
                  <div className="progress">
                    <div className="progress-fill" data-indeterminate={prog.fase === "montando"}
                      style={{ width: pct + "%" }} />
                  </div>
                  <div className="progress-sub">
                    {prog.fase === "preparando"
                      ? `${prog.feitas} de ${prog.total} produtos`
                      : "finalizando e preparando o download"}
                  </div>
                  <button className="btn btn-ghost btn-sm" style={{ marginTop: 14 }} onClick={cancelar}>
                    cancelar
                  </button>
                </div>
              </div>
            )}

            {erro && <div className="alert alert-err">⚠ {erro}</div>}

            <div className="actionbar">
              <button className="btn btn-primary btn-lg" onClick={gerarCsv} disabled={!podeGerar}>
                {ocupado ? <><span className="spin" /> gerando…</> : "Gerar & baixar CSV"}
              </button>
            </div>
          </div>
        ) : (
          <div className="page-enter">
            <div className="card">
              <div className="card-head">
                <h2>Histórico de catálogos</h2>
                <p className="card-sub">Guardado neste navegador. Dá pra baixar o CSV de novo a qualquer momento.</p>
              </div>

              {hist.length === 0 ? (
                <div className="empty">
                  <div className="empty-icon">◷</div>
                  Nenhum catálogo gerado ainda.
                </div>
              ) : (
                <table className="table">
                  <thead>
                    <tr><th>Criativo</th><th>Produtos</th><th>Quando</th><th></th></tr>
                  </thead>
                  <tbody>
                    {hist.map((h) => (
                      <tr key={h.id}>
                        <td>
                          <span className="truncate" title={h.nome}>{h.criativo}</span>
                          <span className="mono" style={{ color: "var(--fg-muted)" }}>{h.nome}</span>
                        </td>
                        <td className="mono">{h.produtos}</td>
                        <td className="mono">{quando(h.criadoEm)}</td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          {h.csv
                            ? <button className="btn btn-sm" onClick={() => baixar(h.nome, h.csv)}>baixar</button>
                            : <span className="hint" style={{ margin: 0, display: "inline" }}>CSV não guardado</span>}
                          <button className="btn btn-sm btn-danger" style={{ marginLeft: 8 }}
                            onClick={() => apagarHist(h.id)}>excluir</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
