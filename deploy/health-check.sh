#!/usr/bin/env bash
# Wartet, bis /health/ready mit 200 antwortet.
#
#   ./deploy/health-check.sh <url> [versuche] [pause-sekunden]
#
# Braucht nur Node (im Workflow ueber actions/setup-node vorhanden) und
# gibt ausschliesslich Versuch und HTTP-Status aus — nie Werte aus den
# env-Dateien.
set -euo pipefail

url="${1:?URL fehlt}"
versuche="${2:-30}"
pause="${3:-5}"

status_von() {
  node -e '
    fetch(process.argv[1], { signal: AbortSignal.timeout(5000) })
      .then((antwort) => process.stdout.write(String(antwort.status)))
      .catch(() => process.stdout.write("000"));
  ' "$1"
}

for ((versuch = 1; versuch <= versuche; versuch++)); do
  status="$(status_von "$url")"

  if [[ "$status" == "200" ]]; then
    echo "ready: HTTP 200 nach Versuch ${versuch}"
    exit 0
  fi

  echo "ready: Versuch ${versuch}/${versuche} ergab HTTP ${status}"

  if ((versuch < versuche)); then
    sleep "$pause"
  fi
done

echo "ready antwortet nicht mit HTTP 200 — Deploy gilt als fehlgeschlagen" >&2
exit 1
