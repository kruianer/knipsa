#!/usr/bin/env bash
# Wartet, bis /health/ready mit 200 antwortet.
#
#   ./deploy/health-check.sh <url> [versuche] [pause-sekunden]
#
# Gibt nur Versuch und HTTP-Status aus — nie Werte aus den env-Dateien.
set -euo pipefail

url="${1:?URL fehlt}"
versuche="${2:-30}"
pause="${3:-5}"

for ((versuch = 1; versuch <= versuche; versuch++)); do
  status="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 5 "$url" || true)"

  if [[ "$status" == "200" ]]; then
    echo "ready: HTTP 200 nach Versuch ${versuch}"
    exit 0
  fi

  echo "ready: Versuch ${versuch}/${versuche} ergab HTTP ${status:-000}"
  sleep "$pause"
done

echo "ready antwortet nicht mit HTTP 200 — Deploy gilt als fehlgeschlagen" >&2
exit 1
