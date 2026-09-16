#!/usr/bin/env bash
# Define as senhas LOCAIS dos papéis de login. As migrations criam os papéis
# sem senha de propósito: senha não entra no versionamento.
# Uso: scripts/local-db-roles.sh   (usa os valores locais padrão)
set -euo pipefail

: "${DATABASE_URL_MIGRATIONS:=postgresql://postgres:postgres@127.0.0.1:54422/postgres}"
: "${OPLYRA_WEB_PASSWORD:=local-web-2026}"
: "${OPLYRA_WORKER_PASSWORD:=local-worker-2026}"
: "${OPLYRA_OPS_PASSWORD:=local-ops-2026}"

case "$DATABASE_URL_MIGRATIONS" in
  *127.0.0.1*|*localhost*) ;;
  *) echo "recusando: este script só configura senhas no banco local" >&2; exit 1 ;;
esac

psql "$DATABASE_URL_MIGRATIONS" -v ON_ERROR_STOP=1 -q \
  -c "alter role oplyra_web_login    with password '$OPLYRA_WEB_PASSWORD'" \
  -c "alter role oplyra_worker_login with password '$OPLYRA_WORKER_PASSWORD'" \
  -c "alter role oplyra_ops_login    with password '$OPLYRA_OPS_PASSWORD'"

echo "senhas locais definidas para oplyra_web_login, oplyra_worker_login e oplyra_ops_login"
