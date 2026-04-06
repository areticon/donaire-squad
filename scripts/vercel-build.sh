#!/usr/bin/env bash
# Roda na Vercel (Linux). Se Root Directory no painel estiver errado, falha com mensagem clara.
set -euo pipefail
echo "=== vercel-build.sh: PWD=$(pwd)"
echo "=== top-level files:"
ls -la
if [[ ! -f package.json ]]; then
  echo "ERRO: package.json não encontrado aqui. Em Vercel: Settings → General → Root Directory deve ficar VAZIO (raiz do repo)."
  exit 1
fi
if [[ ! -f next.config.ts ]] && [[ ! -f next.config.js ]] && [[ ! -f next.config.mjs ]]; then
  echo "ERRO: next.config.* não encontrado — Root Directory provavelmente errado."
  exit 1
fi
echo "=== npm run build (deps vêm do installCommand da Vercel)"
npm run build
echo "=== vercel-build.sh OK"
