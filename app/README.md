# MLN Catalogs

Gera o feed de catálogo do TikTok (CSV de 44 colunas) pronto pro Catalog Manager.
Roda local. Não depende de Cloudflare.

## Como funciona

1. **Nome do criativo** — vira o nome do arquivo CSV e a `custom_label_0` de todas as linhas.
2. **URL de download do vídeo** — link direto pro MP4 (ex: Google Drive público, abaixo de ~100 MB).
3. **Quantidade de produtos** — de 1 a 5000.
4. **Gerar imagens** — gera as imagens white, publica num repositório GitHub e devolve as
   URLs do jsDelivr já carregadas no app. Barra de progresso em tempo real.
5. **Campos do produto** — link, preço, preço promocional, moeda, gênero, categoria.
6. **Gerar & baixar CSV**.

O CSV é montado inteiro no navegador. O backend só existe pro passo 4.

## Colunas de rastreio

| Coluna | Conteúdo |
|---|---|
| `custom_label_0` | nome do criativo |
| `custom_label_2` | número da variação (`Video1`, `Video2`, …) |
| `sku_id` | `<prefixo><criativo>_<sequência>` |

## Rodar

```bash
npm install
npm run dev     # http://localhost:3100
```

Precisa ter na máquina: **Node 18+**, **Python 3 com Pillow**, **git** e **gh** autenticado
(`gh auth login`) com escopo `repo`.

## Imagens

As imagens white são padrões geométricos gerados (1000×1000, grade 6×6, duas cores),
no mesmo estilo do que o TikTok serve no catálogo DPA. Cada catálogo gera um lote novo
em pasta própria (`lote_AAAAMMDDHHMMSS/`), o que evita o cache do jsDelivr — nunca se
sobrescreve uma imagem já publicada.

Gerador e publicação também rodam fora do app:

```bash
python3 ../gerar-imagens-white.py 300 pasta-destino
../publicar-imagens.sh 300 nome-do-repo
```

## Estrutura

- `app/page.js` — interface inteira (client)
- `app/globals.css` — design tokens (baseado no design system da Supabase)
- `app/api/images/generate` — gera + publica + devolve URLs (NDJSON streaming)
- `app/api/fx` — conversor de moeda a partir do euro
- `lib/catalog.js` — montagem do CSV
