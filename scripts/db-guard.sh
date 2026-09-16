#!/usr/bin/env bash
# Trava de segurança para comandos do Supabase local.
#
# A CLI escolhe o stack pelo project_id do config.toml da pasta atual. Rodar
# `stop` ou `db reset` do diretório errado acerta o projeto errado. Este script
# confere identidade e porta antes de repassar o comando.
#
# Uso: scripts/db-guard.sh start|stop|reset|status
set -euo pipefail
cd "$(dirname "$0")/.."

PROJETO_ESPERADO="Oplyra"
PORTA_ESPERADA="54422"

projeto=$(grep -E '^project_id[[:space:]]*=' supabase/config.toml | head -1 | cut -d'"' -f2)
porta=$(awk '/^\[db\]/{d=1} d && /^port[[:space:]]*=/{print $3; exit}' supabase/config.toml)

if [ "$projeto" != "$PROJETO_ESPERADO" ]; then
  echo "recusando: project_id é \"$projeto\", esperado \"$PROJETO_ESPERADO\"." >&2
  echo "Você provavelmente está na pasta de outro projeto." >&2
  exit 1
fi
if [ "$porta" != "$PORTA_ESPERADA" ]; then
  echo "recusando: porta do banco é $porta, esperado $PORTA_ESPERADA." >&2
  echo "A Oplyra usa a faixa 544xx para não colidir com outro stack local." >&2
  exit 1
fi

case "${1:-}" in
  start)  exec supabase start ;;
  status) exec supabase status ;;
  # --project-id explícito: nunca atinge outro stack, mesmo se algo mudar.
  stop)   exec supabase stop --project-id "$PROJETO_ESPERADO" ;;
  reset)
    echo "Recriando o banco LOCAL do projeto \"$projeto\" (porta $porta)."
    echo "Isto apaga os dados locais da Oplyra. O outro stack não é tocado."
    exec supabase db reset --local
    ;;
  *) echo "uso: $0 start|stop|reset|status" >&2; exit 2 ;;
esac
