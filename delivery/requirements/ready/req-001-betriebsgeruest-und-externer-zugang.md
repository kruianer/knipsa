---
id: req-001
app: knipsa
area: Betrieb
created: 2026-10-10
---

# Goal (Why)

Knipsa hat noch keinen Code. Bevor irgendeine Funktion auf dev geprüft
werden kann, braucht das Repo ein lauffähiges Gerüst, das sich per Push
selbst auf den Beelink deployt und unter `https://dev.knipsa.kremmel.org`
bzw. `https://knipsa.kremmel.org` von überall erreichbar ist — ohne
offenen Port am Router, so wie die anderen Apps des Betreibers. Alle
weiteren Requirements (zuerst req-002 Anmeldung) bauen darauf auf.

# Function (What)

**Repo-Gerüst** (nach `delivery/stack.md`)
- pnpm-Workspace mit `packages/shared`, `packages/pipeline`,
  `packages/server`, `packages/viewer`; Node 24 (`.nvmrc`, `engines`).
- ESLint, Prettier, `tsc --noEmit`, Vitest eingerichtet; alle Befehle aus
  `delivery/stack.md` (`pnpm install`, `pnpm -r build`, `pnpm -r test`,
  `pnpm lint`, `pnpm format`, `pnpm typecheck`) laufen grün.
- `packages/server`: Fastify-Server auf Port `3000`, liefert den gebauten
  Viewer (`packages/viewer`, Vite) als statische Dateien aus und hat
  `GET /health`. `/health` prüft die DB-Verbindung und antwortet nur mit
  Status (`ok` / Fehler), ohne weitere Daten.
- `packages/viewer`: leere Startseite "Knipsa" als Platzhalter.
- Kysely mit Migrations-Mechanismus und einer ersten (leeren)
  Migration; Migrationen laufen beim Deploy vor dem Start des Servers.

**Container** (`deploy/docker-compose.yml`, ein Compose-File für beide
Umgebungen, unterschieden über Projektname und env-Datei)
- `server`: Image aus dem Repo (Basis `node:24-slim`), `env_file` =
  `/home/kruianer/knipsa-env/${KNIPSA_ENV}.env`, **keine** `ports:`.
- `db`: `pgvector/pgvector` (aktuelle Postgres-Hauptversion), eigenes
  benanntes Volume je Compose-Projekt, **keine** `ports:`.
- `cloudflared`: `image: cloudflare/cloudflared:latest`,
  `command: tunnel --no-autoupdate run --token ${CLOUDFLARE_TUNNEL_TOKEN}`,
  **keine** `ports:`. Der Tunnel zeigt auf `http://server:3000`.
- Foto-Baum: als Volume eingebunden, Pfad aus `FOTOS_ROOT` der env-Datei
  (dev: Test-Baum, prod: echter Baum — siehe `delivery/devops.md`). Im
  Container immer unter `/fotos`.

**Konfiguration** (nur Variablennamen im Repo, Werte in
`~/knipsa-env/dev.env` bzw. `prod.env`)
- `APP_ORIGIN` — `https://dev.knipsa.kremmel.org` bzw.
  `https://knipsa.kremmel.org`
- `CLOUDFLARE_TUNNEL_TOKEN`, `DATABASE_URL` bzw. `POSTGRES_PASSWORD`,
  `FOTOS_ROOT`
- Eine `deploy/example.env` listet alle Variablen ohne Werte.

**Deploy** (`.github/workflows/`, Jobs auf dem self-hosted Runner des
Beelink)
- Push auf `dev` → Deploy `knipsa-dev`; Push/Merge auf `main` → Deploy
  `knipsa-prod`.
- Ablauf: `pnpm install` → `pnpm lint` → `pnpm typecheck` →
  `pnpm -r test` → `docker compose -p knipsa-<env> build` → Migrationen →
  `docker compose -p knipsa-<env> up -d` → Health-Check gegen `/health`
  (im Container). Schlägt ein Schritt fehl, bleibt die laufende Version
  in Betrieb und der Workflow ist rot.
- Die Workflows lesen keine Secrets aus GitHub und geben keine Werte aus
  den env-Dateien aus.

# Acceptance Criteria

- [ ] Given ein frischer Checkout, when ich die Befehle aus
  `delivery/stack.md` ausführe, then laufen Install, Build, Lint,
  Typecheck und Test grün.
- [ ] Given ein Push auf `dev`, when der Workflow durchläuft, then ist
  unter `https://dev.knipsa.kremmel.org` die Knipsa-Startseite erreichbar
  — vom iPhone im Mobilfunknetz genauso wie im WLAN.
- [ ] Given ein Merge auf `main`, when der Workflow durchläuft, then ist
  die Startseite unter `https://knipsa.kremmel.org` erreichbar, und dev
  läuft unverändert weiter.
- [ ] Given ein Commit mit fehlschlagendem Test, when er auf `dev`
  gepusht wird, then wird nicht deployt und die vorherige Version bleibt
  erreichbar.
- [ ] Given die laufenden Container, when ich `docker ps` auf dem
  Beelink ansehe, then veröffentlicht kein Knipsa-Container einen Port
  auf dem Host.
- [ ] Given dev und prod laufen, when ich ihre Datenbanken vergleiche,
  then sind es getrennte Container mit getrennten Volumes, und dev hat
  nur den Test-Baum unter `/fotos` eingebunden.
- [ ] Given die Datenbank ist nicht erreichbar, when `/health`
  aufgerufen wird, then meldet es einen Fehler (und der Deploy-Workflow
  schlägt fehl).

# Constraints

- Kein Port am Router, kein `ports:` in der Compose-Datei. Erreichbarkeit
  nur über den Cloudflare-Tunnel.
- Tunnel-Token, DB-Passwort und alle anderen Secrets stehen nur in
  `/home/kruianer/knipsa-env/*.env` auf dem Beelink — nie im Repo, nie
  in der Compose- oder Workflow-Datei, nie im Log.
- Der Worker deployt nie selbst nach prod; prod entsteht nur durch den
  Merge des Betreibers auf `main` (siehe `delivery/devops.md`).
- Vom Betreiber vorab zu erledigen (nicht Teil der Umsetzung): Tunnel
  `knipsa-dev` und `knipsa-prod` im Cloudflare-Konto anlegen, env-Dateien
  befüllen, self-hosted Runner registrieren, Branch `dev` anlegen,
  NAS-Pfade festlegen.

# Out of Scope

- Anmeldung und Zugangsschutz (→ req-002). Bis req-002 auf dev läuft,
  zeigt die App nur die Platzhalter-Startseite und keine Fotos.
- Ollama, Embedding-Dienst und deren Container (kommen mit der
  KI-Etappe).
- SSH-Zugang zum Beelink (besteht bereits, siehe `delivery/devops.md`).
- Überwachung der Sicherung.
