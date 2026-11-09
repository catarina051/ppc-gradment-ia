#!/usr/bin/env sh
# Gera workflows/ppc-gradment.json e implanta no n8n do docker compose.
set -e
cd "$(dirname "$0")/.."
export MSYS_NO_PATHCONV=1

node n8n/montar-workflow.mjs

docker compose up -d --build gotenberg extrator
docker compose stop n8n
docker compose run --rm --no-deps n8n import:workflow --input=/data/workflows/ppc-gradment.json
docker compose run --rm --no-deps n8n publish:workflow --id=pgIaGradmentPpc1
docker compose up -d n8n
# O n8n pode manter a pagina do Formulario da versao anterior em memoria; reiniciar garante as opcoes novas.
docker compose restart n8n

formulario_ok() { curl -fs -m 5 http://localhost:"${N8N_PORTA:-5680}"/form/ppc-gradment > /dev/null; }
esperar() {
  i=0
  until formulario_ok; do
    i=$((i + 1)); [ "$i" -ge "$1" ] && return 1
    printf '.'; sleep 2
  done
}

printf 'Aguardando o formulário responder em http://localhost:%s/form/ppc-gradment' "${N8N_PORTA:-5680}"
esperar 120 || { echo ' o n8n não respondeu em 4 min; verifique: docker compose logs n8n'; exit 1; }
echo ' pronto!'

