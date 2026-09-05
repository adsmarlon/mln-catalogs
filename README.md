# MLN Catalogs

Gera o feed de catálogo do TikTok (CSV de 44 colunas) pronto pro Catalog Manager.
Roda na sua máquina.

## Instalar

**Mac** — abra o Terminal e cole:

```bash
curl -fsSL https://raw.githubusercontent.com/adsmarlon/mln-catalogs/main/instalar.sh | bash
```

**Windows** — abra o PowerShell e cole:

```powershell
irm https://raw.githubusercontent.com/adsmarlon/mln-catalogs/main/instalar.ps1 | iex
```

A instalação leva de 1 a 3 minutos e não pede senha de administrador. No fim,
um atalho **MLN Catalogs** aparece na sua Área de Trabalho — é por ele que você
abre o programa daqui pra frente.

## Primeira vez

O programa pede para conectar sua conta do GitHub, que é onde as imagens dos
catálogos ficam hospedadas. Ele mostra um código, você abre o endereço que
aparece na tela, cola o código e autoriza. É uma vez só.

Um repositório público `mln-catalog-images` é criado na sua conta para guardar
as imagens.

## Como usar

1. Nome do criativo
2. URL de download do vídeo (link do Drive serve — ele converte sozinho)
3. Quantidade de produtos
4. Campos do produto: link, preço, moeda, categoria
5. **Gerar & baixar CSV**

As imagens são geradas e publicadas automaticamente durante esse último passo.

## Requisitos

Só Node.js 18 ou superior — e o instalador baixa sozinho se você não tiver.
