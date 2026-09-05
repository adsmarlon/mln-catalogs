// Lógica de geração do catálogo TikTok. Puro JS (roda no navegador).

export const HEADER = [
  "sku_id", "title", "description", "availability", "condition", "price",
  "link", "image_link", "video_link", "brand", "additional_image_link",
  "age_group", "color", "gender", "item_group_id", "google_product_category",
  "material", "pattern", "product_type", "sale_price",
  "sale_price_effective_date", "shipping", "shipping_weight", "gtin", "mpn",
  "size", "tax", "ios_url", "ios_app_store_id", "ios_app_name", "iPhone_url",
  "iPhone_app_store_id", "iPhone_app_name", "iPad_url", "iPad_app_store_id",
  "iPad_app_name", "android_url", "android_package", "android_app_name",
  "custom_label_0", "custom_label_1", "custom_label_2", "custom_label_3",
  "custom_label_4",
];

// Caracteres invisíveis de largura zero (não-whitespace, não cortados pelo TikTok)
const INVIS = [0x2061, 0x2062, 0x2063]; // Function Application / Invisible Times / Invisible Separator

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function shuffle(arr, rnd) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// n itens distribuídos igualmente entre k opções, embaralhado
function assignEven(n, k, rnd) {
  const idx = [];
  const per = Math.floor(n / k);
  for (let v = 0; v < k; v++) for (let c = 0; c < per; c++) idx.push(v);
  let j = 0;
  while (idx.length < n) { idx.push(j % k); j++; }
  return shuffle(idx, rnd);
}

export function genInvisible(len, rnd) {
  let s = "";
  for (let i = 0; i < len; i++) s += String.fromCodePoint(INVIS[Math.floor(rnd() * INVIS.length)]);
  return s;
}

const ZERO_DECIMAL = ["JPY", "KRW", "VND", "CLP", "ISK", "HUF", "TWD"];
export function formatPrice(amount, currency) {
  const c = String(currency || "").toUpperCase().trim();
  const a = parseFloat(String(amount).replace(",", ".").trim());
  if (!isFinite(a)) return "";
  if (ZERO_DECIMAL.includes(c)) return `${Math.round(a)} ${c}`;
  return `${a.toFixed(2)} ${c}`;
}

// Nome do criativo a partir da URL. Nunca devolve o host (o fallback antigo
// devolvia "drive.google.com"). Sem nome utilizavel, devolve "".
export function deriveVideoName(url) {
  try {
    const u = new URL(String(url));
    const arquivo = u.pathname.split("/").filter(Boolean).pop() || "";
    if (arquivo && /\.(mp4|mov|webm|m4v)$/i.test(arquivo)) {
      return decodeURIComponent(arquivo).replace(/\.[^.]+$/, "");
    }
  } catch {}
  return "";
}

// nome seguro p/ sku (sem espaço/acento/símbolo)
export function skuSafe(s) {
  return String(s || "").trim().replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "");
}

// Link de compartilhamento do Drive -> link de download direto.
// Qualquer outra coisa (outro servidor, ou link do Drive que ja e direto)
// passa intacta.
export function normalizarUrlVideo(url) {
  const u = String(url || "").trim();
  if (!u) return u;

  let host;
  try { host = new URL(u).hostname.toLowerCase(); } catch { return u; }

  // so mexe no drive.google.com; drive.usercontent.google.com ja e direto
  if (host !== "drive.google.com" && !host.endsWith(".drive.google.com")) return u;

  // ja esta no formato de download
  if (/\/uc\b/.test(u) && /[?&]export=download\b/.test(u)) return u;

  // /file/d/<ID>/view  ou  /d/<ID>  ou  ?id=<ID>  ou  /open?id=<ID>
  const m = u.match(/\/d\/([^/?#]+)/) || u.match(/[?&]id=([^&#]+)/);
  if (!m || !m[1]) return u;

  return `https://drive.google.com/uc?export=download&id=${m[1]}`;
}

// nomeBase: nome do criativo informado pelo gestor. Com varios videos,
// vira nomeBase_1, nomeBase_2... Sem nomeBase, tenta derivar da URL.
export function parseVideos(text, nomeBase) {
  const originais = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && /^https?:\/\//i.test(l));
  const base = String(nomeBase || "").trim();
  return originais.map((original, i) => {
    const url = normalizarUrlVideo(original);
    let name = base ? (originais.length > 1 ? `${base}_${i + 1}` : base) : deriveVideoName(url);
    if (!name) name = `video_${i + 1}`;
    return { url, name, original, convertido: url !== original };
  });
}

function csvEscape(v) {
  v = v == null ? "" : String(v);
  if (/[",\n\r]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
  return v;
}

// gerador por linha: modo invisible sai ÚNICO em cada linha (anti-duplicate,
// importante quando o count passa do pool e as imagens repetem)
function makeFieldGen(field, rnd) {
  if (!field || field.mode === "empty") return () => "";
  if (field.mode === "text") return () => field.text || "";
  const seen = new Set();
  return () => {
    let s;
    do { s = genInvisible(field.len || 40, rnd); } while (seen.has(s));
    seen.add(s);
    return s;
  };
}

// opts: { images[], count, videos[{url,name}], title{mode,text,len}, description{...},
//   brand{mode,names[],single,len}, link, category, gender, age, condition,
//   availability, price, currency, priceString, skuPrefix, seed, shuffleImages, tagVideo }
export function buildCatalogCsv(opts) {
  const seed = (opts.seed >>> 0) || 1;

  const pool = (opts.images || []).slice();
  if (opts.shuffleImages) shuffle(pool, mulberry32((seed ^ 0x9e3779b9) >>> 0));
  if (pool.length === 0) throw new Error("Pool de imagens vazio.");
  // count livre: acima do pool as imagens repetem em ciclo (guard de 10k por sanidade)
  let n = parseInt(opts.count, 10);
  if (!isFinite(n) || n <= 0) n = pool.length;
  n = Math.min(n, 10000);
  const imgs = Array.from({ length: n }, (_, i) => pool[i % pool.length]);

  const videos = (opts.videos || []).filter((v) => v && v.url);
  if (videos.length === 0) throw new Error("Cole pelo menos 1 vídeo black.");

  const vIdx = assignEven(n, videos.length, mulberry32((seed + 1) >>> 0));

  let brandFor;
  if (opts.brand.mode === "single") {
    const b = opts.brand.single || "";
    brandFor = () => b;
  } else if (opts.brand.mode === "invisible") {
    const b = genInvisible(opts.brand.len || 66, mulberry32((seed + 2) >>> 0));
    brandFor = () => b;
  } else {
    const names = (opts.brand.names || []).filter(Boolean);
    const bIdx = assignEven(n, names.length || 1, mulberry32((seed + 3) >>> 0));
    brandFor = (i) => names[bIdx[i]] || "";
  }

  // sku por criativo: tag do vídeo (única) + sequência reiniciando por criativo
  const baseTags = videos.map((v) => skuSafe(v.name) || "v");
  const dupRun = {};
  const tags = baseTags.map((t) => {
    if (baseTags.filter((x) => x === t).length > 1) { dupRun[t] = (dupRun[t] || 0) + 1; return t + dupRun[t]; }
    return t;
  });
  const vCounts = {};
  for (const vi of vIdx) vCounts[vi] = (vCounts[vi] || 0) + 1;
  const skuWidth = Math.max(2, String(Math.max(...Object.values(vCounts), 1)).length);
  const seqByVid = {};

  const titleGen = makeFieldGen(opts.title, mulberry32((seed + 4) >>> 0));
  const descGen = makeFieldGen(opts.description, mulberry32((seed + 5) >>> 0));
  const priceString = opts.priceString || formatPrice(opts.price, opts.currency);

  const dist = {};
  const lines = [HEADER.map(csvEscape).join(",")];
  for (let i = 0; i < n; i++) {
    const vi = vIdx[i];
    seqByVid[vi] = (seqByVid[vi] || 0) + 1;
    const row = {};
    for (const h of HEADER) row[h] = "";
    row.sku_id = `${opts.skuPrefix || ""}${tags[vi]}_${String(seqByVid[vi]).padStart(skuWidth, "0")}`;
    row.title = titleGen();
    row.description = descGen();
    row.availability = opts.availability || "in stock";
    row.condition = opts.condition || "new";
    row.price = priceString;
    if (opts.salePriceString) row.sale_price = opts.salePriceString;
    row.link = opts.link || "";
    row.image_link = imgs[i];
    row.video_link = videos[vIdx[i]].url;
    row.brand = brandFor(i);
    row.age_group = opts.age || "adult";
    row.gender = opts.gender || "";
    row.google_product_category = opts.category || "";
    if (opts.tagVideo !== false) row.custom_label_0 = videos[vIdx[i]].name || "black_" + (vIdx[i] + 1);
    // numero da variacao: cada repeticao do mesmo criativo recebe Video1, Video2...
    row.custom_label_2 = "Video" + seqByVid[vi];
    lines.push(HEADER.map((h) => csvEscape(row[h])).join(","));
    const nm = videos[vIdx[i]].name;
    dist[nm] = (dist[nm] || 0) + 1;
  }

  return {
    csv: lines.join("\r\n"),
    stats: { products: n, videos: videos.length, columns: HEADER.length, priceString, distribution: dist },
  };
}
