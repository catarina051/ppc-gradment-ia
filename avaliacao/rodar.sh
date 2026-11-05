#!/usr/bin/env sh
# Executa o pipeline real (n8n em http://localhost:5680) N vezes sobre um PPC e registra o tempo de
# ponta a ponta em avaliacao/execucoes/tempos.csv.
#
# Uso: sh avaliacao/rodar.sh <rotulo> <arquivo-ppc> <n-execucoes>
#   ex.: sh avaliacao/rodar.sh sintetico samples/ppc-ciencia-computacao.pdf 5
set -e
cd "$(dirname "$0")/.."
ROTULO="$1"; PPC="$2"; N="${3:-1}"
CSV=avaliacao/execucoes/tempos.csv
[ -f "$CSV" ] || echo "rotulo,execucao,inicio_iso,http,segundos" > "$CSV"

i=1
while [ "$i" -le "$N" ]; do
  # próximo número livre para não sobrescrever execuções anteriores
  k=1; while [ -f "avaliacao/execucoes/${ROTULO}-$(printf %02d $k).json" ]; do k=$((k + 1)); done
  SAIDA="avaliacao/execucoes/${ROTULO}-$(printf %02d $k).json"
  INICIO=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  RES=$(curl -s -X POST "http://localhost:${N8N_PORTA:-5680}/webhook/converter-ppc" \
    -F "ppc=@${PPC}" -F "curso_id=1" -F "ano_periodo=2026.1" -F "gerar_pdfs=false" \
    -o "$SAIDA" -w "%{http_code},%{time_total}" --max-time 1200 || echo "000,0")
  echo "${ROTULO},$(basename "$SAIDA" .json),${INICIO},${RES}" >> "$CSV"
  echo "${SAIDA}: ${RES}"
  i=$((i + 1))
done
