// Conexao com o GitHub pelo Device Flow (mesmo mecanismo do `gh auth login`).
// O client_id de um OAuth App e publico por design — nao e segredo.
import fs from "node:fs";
import path from "node:path";
import git from "isomorphic-git";
import http from "isomorphic-git/http/node";

// client_id do OAuth App "MLN Catalogs". E publico por design: o Device Flow
// foi feito pra aplicativos que rodam na maquina do usuario e nao guardam segredo.
export const CLIENT_ID = process.env.GITHUB_CLIENT_ID || "Ov23liEHWNSeLfwIyHwa";
export const ESCOPO = "public_repo";
const NOME_REPO_PADRAO = process.env.IMG_REPO_NAME || "mln-catalog-images";

const DIR_DADOS = process.env.MLN_DATA_DIR || path.join(process.cwd(), ".mln");
const ARQ_AUTH = path.join(DIR_DADOS, "auth.json");
export const DIR_REPO = path.join(DIR_DADOS, "images-repo");
export const DIR_TEMP = path.join(DIR_DADOS, "tmp");

// nome de pasta seguro pra URL e pra disco.
// Acentos viram a letra base (Ação -> Acao) em vez de sumirem.
function pastaSegura(s) {
  return String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim().replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_.-]/g, "")
    || "catalogo";
}

/* ---------------- credenciais em disco ---------------- */

export function lerAuth() {
  try { return JSON.parse(fs.readFileSync(ARQ_AUTH, "utf8")); } catch { return null; }
}

function gravarAuth(dados) {
  fs.mkdirSync(DIR_DADOS, { recursive: true });
  fs.writeFileSync(ARQ_AUTH, JSON.stringify(dados, null, 2), { mode: 0o600 });
}

export function desconectar() {
  try { fs.rmSync(ARQ_AUTH, { force: true }); } catch {}
}

/* ---------------- device flow ---------------- */

async function postJson(url, corpo) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(corpo),
  });
  return r.json();
}

// Passo 1: pede o codigo que o gestor vai digitar no github.com/login/device
export async function iniciarDeviceFlow() {
  if (!CLIENT_ID) {
    throw new Error(
      "GITHUB_CLIENT_ID não configurado. Registre um OAuth App em " +
      "github.com/settings/developers (com Device Flow ativado) e coloque o client_id no .env.local."
    );
  }
  const j = await postJson("https://github.com/login/device/code", {
    client_id: CLIENT_ID,
    scope: ESCOPO,
  });
  if (j.error) throw new Error(`GitHub: ${j.error_description || j.error}`);
  return {
    device_code: j.device_code,
    user_code: j.user_code,
    verification_uri: j.verification_uri,
    interval: j.interval || 5,
    expires_in: j.expires_in || 900,
  };
}

// Passo 2: pergunta ao GitHub se o gestor ja autorizou.
// Devolve {pendente:true} enquanto ele nao terminou.
export async function verificarDeviceFlow(deviceCode) {
  const j = await postJson("https://github.com/login/oauth/access_token", {
    client_id: CLIENT_ID,
    device_code: deviceCode,
    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
  });

  if (j.error === "authorization_pending") return { pendente: true };
  if (j.error === "slow_down") return { pendente: true, intervalo: j.interval || 10 };
  if (j.error === "expired_token") throw new Error("O código expirou. Comece de novo.");
  if (j.error === "access_denied") throw new Error("Autorização recusada no GitHub.");
  if (j.error) throw new Error(`GitHub: ${j.error_description || j.error}`);
  if (!j.access_token) throw new Error("O GitHub não devolveu o token.");

  return { pendente: false, token: j.access_token };
}

/* ---------------- API do GitHub ---------------- */

async function api(caminho, token, opcoes = {}) {
  const r = await fetch(`https://api.github.com${caminho}`, {
    ...opcoes,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(opcoes.body ? { "Content-Type": "application/json" } : {}),
      ...opcoes.headers,
    },
  });
  const texto = await r.text();
  let j = null;
  try { j = texto ? JSON.parse(texto) : null; } catch {}
  return { ok: r.ok, status: r.status, dados: j };
}

export async function usuarioDoToken(token) {
  const { ok, dados, status } = await api("/user", token);
  if (!ok) throw new Error(`Não consegui ler sua conta do GitHub (HTTP ${status}).`);
  return dados.login;
}

// Cria o repositorio publico se ainda nao existir. Idempotente.
async function garantirRepo(token, login, nome) {
  const existe = await api(`/repos/${login}/${nome}`, token);
  if (existe.ok) return { criado: false };

  const criacao = await api("/user/repos", token, {
    method: "POST",
    body: JSON.stringify({
      name: nome,
      description: "Imagens de catálogo geradas pelo MLN Catalogs",
      private: false,
      auto_init: false,
      has_issues: false,
      has_wiki: false,
      has_projects: false,
    }),
  });
  if (!criacao.ok) {
    const msg = criacao.dados?.errors?.[0]?.message || criacao.dados?.message || `HTTP ${criacao.status}`;
    throw new Error(`Não consegui criar o repositório "${nome}": ${msg}`);
  }
  return { criado: true };
}

/* ---------------- repositorio local ---------------- */

// Deixa o repositorio local coerente com o remoto.
// Se o remoto ja tem commits e o local nao os conhece (repo novo, reinstalacao,
// ou repo que ja existia antes do app), refaz por clone raso — senao o push
// falha com "Could not find <sha>" por historia desconexa.
async function sincronizarRepoLocal(a) {
  const url = `https://github.com/${a.login}/${a.repo}.git`;
  const onAuth = () => ({ username: "x-access-token", password: a.token });

  let cabecaRemota = null;
  try {
    const refs = await git.listServerRefs({
      http, url, prefix: "refs/heads/main", onAuth,
    });
    cabecaRemota = refs.find((r) => r.ref === "refs/heads/main")?.oid || null;
  } catch { /* remoto vazio ou inacessivel: trata como vazio */ }

  const temGit = fs.existsSync(path.join(DIR_REPO, ".git"));

  if (temGit) {
    if (!cabecaRemota) return;                       // remoto vazio: local serve
    try {
      await git.readCommit({ fs, dir: DIR_REPO, oid: cabecaRemota });
      return;                                        // local ja conhece o remoto
    } catch {
      fs.rmSync(DIR_REPO, { recursive: true, force: true }); // desconexo: refaz
    }
  }

  fs.mkdirSync(DIR_REPO, { recursive: true });
  if (cabecaRemota) {
    await git.clone({
      fs, http, dir: DIR_REPO, url,
      ref: "main", singleBranch: true, depth: 1, onAuth,
    });
  } else {
    await git.init({ fs, dir: DIR_REPO, defaultBranch: "main" });
    fs.writeFileSync(path.join(DIR_REPO, ".gitignore"), ".DS_Store\n");
    fs.writeFileSync(
      path.join(DIR_REPO, "README.md"),
      "# Imagens de catálogo\n\nGeradas pelo MLN Catalogs. Servidas por jsDelivr.\n"
    );
  }
}

// Conclui a conexao: valida o token, cria o repo e prepara o clone local.
export async function concluirConexao(token) {
  const login = await usuarioDoToken(token);
  const nome = NOME_REPO_PADRAO;
  const { criado } = await garantirRepo(token, login, nome);
  gravarAuth({ token, login, repo: nome, conectadoEm: new Date().toISOString() });
  // adianta o clone local; se falhar (rede instável), nao impede a conexao —
  // publicar() sincroniza de novo antes de cada publicacao.
  try {
    await sincronizarRepoLocal({ token, login, repo: nome });
  } catch { /* segue conectado */ }
  return { login, repo: `${login}/${nome}`, criado };
}

export function estado() {
  const a = lerAuth();
  if (!a) return { conectado: false, temClientId: !!CLIENT_ID };
  return {
    conectado: true,
    temClientId: !!CLIENT_ID,
    login: a.login,
    repo: `${a.login}/${a.repo}`,
    conectadoEm: a.conectadoEm,
  };
}

// Move o lote gerado para catalogs/<criativo>/ e publica.
// Devolve { slug, caminho } — caminho relativo dentro do repositorio.
export async function publicar({ origem, criativo }) {
  const a = lerAuth();
  if (!a) throw new Error("GitHub não conectado.");
  await sincronizarRepoLocal(a);

  const nome = pastaSegura(criativo);
  let relativo = `catalogs/${nome}`;
  let destino = path.join(DIR_REPO, "catalogs", nome);
  for (let i = 2; fs.existsSync(destino); i++) {
    relativo = `catalogs/${nome}-${i}`;
    destino = path.join(DIR_REPO, "catalogs", `${nome}-${i}`);
  }

  fs.mkdirSync(destino, { recursive: true });
  for (const f of fs.readdirSync(origem)) {
    fs.renameSync(path.join(origem, f), path.join(destino, f));
  }
  fs.rmSync(origem, { recursive: true, force: true });

  await git.add({ fs, dir: DIR_REPO, filepath: "." });
  await git.commit({
    fs, dir: DIR_REPO, message: `${relativo}: ${fs.readdirSync(destino).length} imagens`,
    author: { name: "MLN Catalogs", email: "mln@local" },
  });

  const r = await git.push({
    fs, http, dir: DIR_REPO,
    url: `https://github.com/${a.login}/${a.repo}.git`,
    ref: "main", remoteRef: "refs/heads/main",
    onAuth: () => ({ username: "x-access-token", password: a.token }),
  });
  if (r?.error) throw new Error(`Falha ao publicar: ${r.error}`);

  return { slug: `${a.login}/${a.repo}`, caminho: relativo };
}
