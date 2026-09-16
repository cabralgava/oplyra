#!/usr/bin/env bash
# Varredura de segredos nos arquivos versionados (critério A13 / TST-18).
# Procura formatos de credencial real. Senhas locais de container descartável
# são permitidas e estão documentadas; chaves de serviço, JWT e PEM não são.
set -uo pipefail
cd "$(dirname "$0")/.."

PADROES=(
  'sb_secret_[A-Za-z0-9_-]{10,}'
  'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}'
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'
  'sk-[A-Za-z0-9]{20,}'
  'service_role.{0,20}[A-Za-z0-9_-]{40,}'
)

falhas=0
for p in "${PADROES[@]}"; do
  if achado=$(git grep -nIE "$p" -- ':!*.lock' ':!pnpm-lock.yaml' 2>/dev/null); then
    echo "possível segredo encontrado ($p):"
    echo "$achado" | head -5
    falhas=$((falhas + 1))
  fi
done

if git ls-files --error-unmatch .env >/dev/null 2>&1; then
  echo ".env está versionado"; falhas=$((falhas + 1))
fi

if [ "$falhas" -gt 0 ]; then echo; echo "varredura de segredos: $falhas ocorrência(s)"; exit 1; fi
echo "varredura de segredos: nada encontrado nos arquivos versionados"
