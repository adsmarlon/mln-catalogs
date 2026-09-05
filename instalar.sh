#!/bin/bash
# MLN Catalogs — instalação no macOS.
# Uso:  curl -fsSL https://raw.githubusercontent.com/adsmarlon/mln-catalogs/main/instalar.sh | bash
# Instala tudo dentro da pasta do usuário. Não precisa de senha de administrador.

set -u
NODE_VER="v24.20.0"
REPO="adsmarlon/mln-catalogs"
DESTINO="${MLN_DESTINO:-$HOME/Library/Application Support/MLN Catalogs}"
APP="$DESTINO/app"
NODE_DIR="$DESTINO/node"
ATALHO="${MLN_ATALHO:-$HOME/Desktop/MLN Catalogs.command}"

echo ""
echo "  ┌────────────────────────────────┐"
echo "  │        MLN  CATALOGS           │"
echo "  │        instalação              │"
echo "  └────────────────────────────────┘"
echo ""

falhar() { echo ""; echo "  ✗ $1"; echo ""; exit 1; }

# ---------- 1. Node ----------
NODE_BIN=""
if command -v node >/dev/null 2>&1; then
  V=$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)
  [ "$V" -ge 18 ] 2>/dev/null && NODE_BIN="$(command -v node)"
fi
[ -x "$NODE_DIR/bin/node" ] && NODE_BIN="$NODE_DIR/bin/node"

if [ -z "$NODE_BIN" ]; then
  case "$(uname -m)" in
    arm64) ARQ="darwin-arm64" ;;
    *)     ARQ="darwin-x64" ;;
  esac
  echo "  → Baixando o Node.js ($ARQ, ~50 MB)…"
  mkdir -p "$NODE_DIR"
  TMPN=$(mktemp -d)
  curl -fL --progress-bar "https://nodejs.org/dist/$NODE_VER/node-$NODE_VER-$ARQ.tar.gz" -o "$TMPN/node.tar.gz" \
    || falhar "Não consegui baixar o Node.js. Verifique sua internet."
  tar -xzf "$TMPN/node.tar.gz" -C "$TMPN" || falhar "O download do Node.js veio corrompido."
  cp -R "$TMPN/node-$NODE_VER-$ARQ/." "$NODE_DIR/"
  rm -rf "$TMPN"
  NODE_BIN="$NODE_DIR/bin/node"
  echo "  ✓ Node.js instalado"
else
  echo "  ✓ Node.js já estava aqui ($("$NODE_BIN" -v))"
fi

export PATH="$(dirname "$NODE_BIN"):$PATH"
NPM_BIN="$(dirname "$NODE_BIN")/npm"
[ -x "$NPM_BIN" ] || NPM_BIN="npm"

# ---------- 2. baixa o aplicativo ----------
echo "  → Baixando o aplicativo…"
TMPA=$(mktemp -d)
curl -fsSL "https://codeload.github.com/$REPO/tar.gz/refs/heads/main" -o "$TMPA/app.tar.gz" \
  || falhar "Não consegui baixar o aplicativo."
tar -xzf "$TMPA/app.tar.gz" -C "$TMPA" || falhar "O download do aplicativo veio corrompido."
ORIGEM=$(find "$TMPA" -maxdepth 2 -type d -name app | head -1)
[ -d "$ORIGEM" ] || falhar "Pacote do aplicativo em formato inesperado."

mkdir -p "$APP"
cp -R "$ORIGEM/." "$APP/" || falhar "Não consegui copiar os arquivos."
rm -rf "$TMPA"

# ---------- 3. dependências ----------
echo "  → Instalando dependências (pode levar 1–2 minutos)…"
( cd "$APP" && "$NPM_BIN" install --no-audit --no-fund --loglevel=error ) \
  || falhar "Falha ao instalar as dependências."

echo "  → Preparando o aplicativo…"
( cd "$APP" && "$NPM_BIN" run build ) >/dev/null 2>&1 \
  || falhar "Falha ao preparar o aplicativo."

# ---------- 4. atalho ----------
cat > "$ATALHO" <<ATALHOEOF
#!/bin/bash
export PATH="$(dirname "$NODE_BIN"):\$PATH"
cd "$APP"
echo ""
echo "  MLN Catalogs está iniciando…"
echo "  Para fechar o programa, feche esta janela."
echo ""
npm run start >/dev/null 2>&1 &
for i in \$(seq 1 40); do
  curl -s -o /dev/null http://localhost:3100 && break
  sleep 0.5
done
open http://localhost:3100
wait
ATALHOEOF
chmod +x "$ATALHO"
# o atalho foi criado localmente, entao nao carrega quarentena
xattr -d com.apple.quarantine "$ATALHO" 2>/dev/null || true

echo ""
echo "  ✓ Instalado."
echo ""
echo "  Um atalho \"MLN Catalogs\" foi criado na sua Área de Trabalho."
echo "  É por ele que você abre o programa daqui pra frente."
echo ""
