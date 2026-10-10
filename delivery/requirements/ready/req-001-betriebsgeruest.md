---
id: req-001
app: knipsa
area: Betrieb
created: 2026-10-10
---

# Goal (Why)

Knipsa hat noch keinen Code. Bevor irgendeine Funktion auf dev geprüft
werden kann, braucht das Repo ein lauffähiges Gerüst, das sich per Push
selbst auf den Beelink deployt: Container, Datenbank und eine
Minimalseite mit Health-Route. Vorerst ist alles nur im Heim-WLAN über
die IP des Beelink erreichbar; der externe Zugang über Cloudflare-Tunnel
folgt in einem eigenen Requirement (req-004). Alle weiteren Requirements
bauen auf diesem Gerüst auf.

# Function (What)

**Repo-Gerüst** (nach `delivery/stack.md`)
- pnpm-Workspace mit `packages/shared`, `packages/pipeline`,
  `packages/server`, `packages/viewer`; Node 24 (`.nvmrc`, `engines`).
- ESLint, Prettier, `tsc --noEmit`, Vitest eingerichtet; alle Befehle aus
  `delivery/stack.md` (`pnpm install`, `pnpm -r build`, `pnpm -r test`,
  `pnpm lint`, `pnpm format`, `pnpm typecheck`) laufen grün.
- `packages/server`: Fastify-Server auf Port `3000` im Container, liefert
  den gebauten Viewer (`packages/viewer`, Vite) als statische Dateien aus.
- Health-Routen:
  - `GET /health/live` — der Prozess läuft (immer `200`, ohne DB).
  - `GET /health/ready` — prüft die DB-Verbindung und die eingebundene
    Wurzel `/fotos` (vorhanden, lesbar); `200` wenn beides ok, sonst
    `503`. Antwort nur mit Status je Prüfung (`ok` / `fehler`), ohne
    Pfade, Versionen oder sonstige Details.
- `packages/viewer`: Minimalseite "Knipsa" mit Umgebung (dev/prod) und
  dem Ergebnis von `/health/ready` als einfache Ampel.
- Kysely mit Migrations-Mechanismus und einer ersten (leeren) Migration;
  Migrationen laufen beim Deploy vor dem Start des Servers.

**Container** (`deploy/docker-compose.yml`, ein Compose-File für beide
Umgebungen, unterschieden über Projektname und env-Datei)
- `server`: Image aus dem Repo (Basis `node:24-slim`), `env_file` =
  `/home/kruianer/knipsa-env/${KNIPSA_ENV}.env`, Port nur an die LAN-IP
  gebunden: `192.168.2.200:${KNIPSA_PORT}:3000`.
- `db`: `pgvector/pgvector` (aktuelle Postgres-Hauptversion), eigenes
  benanntes Volume je Compose-Projekt, **keine** `ports:` — nur im
  Docker-Netz erreichbar. Die Extension `vector` ist aktiviert.
- Foto-Baum: als Volume eingebunden, Pfad aus `FOTOS_ROOT` der env-Datei
  (dev: Test-Baum, prod: echter Baum — siehe `delivery/devops.md`). Im
  Container immer unter `/fotos`. In diesem Requirement nur lesend
  eingebunden (`:ro`), da noch nichts geschrieben wird.

| | dev | prod |
|---|---|---|
| Compose-Projekt | `knipsa-dev` | `knipsa-prod` |
| `KNIPSA_PORT` | `8098` | `8099` |
| URL im LAN | `http://192.168.2.200:8098` | `http://192.168.2.200:8099` |

**Konfiguration** (nur Variablennamen im Repo, Werte in
`/home/kruianer/knipsa-env/dev.env` bzw. `prod.env`)
- `KNIPSA_ENV`, `KNIPSA_PORT`, `APP_ORIGIN` (vorerst die LAN-URL aus der
  Tabelle), `POSTGRES_PASSWORD`, `DATABASE_URL`, `FOTOS_ROOT`.
- Eine `deploy/example.env` listet alle Variablen ohne Werte.

**Deploy** (`.github/workflows/`, Jobs auf dem self-hosted Runner des
Beelink)
- Push auf `dev` → Deploy `knipsa-dev`; Push/Merge auf `main` → Deploy
  `knipsa-prod`.
- Ablauf: `pnpm install` → `pnpm lint` → `pnpm typecheck` →
  `pnpm -r test` → `docker compose -p knipsa-<env> build` → Migrationen →
  `docker compose -p knipsa-<env> up -d` → Health-Check gegen
  `/health/ready`. Schlägt ein Schritt fehl, ist der Workflow rot; schlägt
  er vor `up -d` fehl, bleibt die laufende Version in Betrieb.
- Die Workflows lesen keine Secrets aus GitHub und geben keine Werte aus
  den env-Dateien aus.

# Acceptance Criteria

- [ ] Given ein frischer Checkout, when ich die Befehle aus
  `delivery/stack.md` ausführe, then laufen Install, Build, Lint,
  Typecheck und Test grün.
- [ ] Given ein Push auf `dev`, when der Workflow durchläuft, then zeigt
  `http://192.168.2.200:8098` im Heim-WLAN die Knipsa-Minimalseite mit
  "dev" und grüner Ampel.
- [ ] Given ein Merge auf `main`, when der Workflow durchläuft, then zeigt
  `http://192.168.2.200:8099` die Minimalseite mit "prod", und dev läuft
  unverändert weiter.
- [ ] Given beide Umgebungen laufen, when ich `/health/live` und
  `/health/ready` aufrufe, then antworten beide mit `200` und nur
  Status-Angaben.
- [ ] Given der DB-Container ist gestoppt, when ich `/health/ready`
  aufrufe, then antwortet es mit `503` und meldet die DB als `fehler`,
  während `/health/live` weiter `200` liefert.
- [ ] Given ein Commit mit fehlschlagendem Test, when er auf `dev`
  gepusht wird, then wird nicht deployt und die vorherige Version bleibt
  erreichbar.
- [ ] Given die laufenden Container, when ich `docker ps` auf dem
  Beelink ansehe, then veröffentlicht nur `server` einen Port, und zwar
  nur an `192.168.2.200`; die Datenbank hat keinen Port am Host.
- [ ] Given dev und prod laufen, when ich ihre Datenbanken vergleiche,
  then sind es getrennte Container mit getrennten Volumes, und dev hat
  nur den Test-Baum unter `/fotos` eingebunden.

# Constraints

- Übergangslösung: Erreichbar nur im Heim-WLAN über HTTP und die IP des
  Beelink. Kein Port am Router, keine Bindung an `0.0.0.0`. Solange das
  gilt, zeigt die App keine Fotos und keine personenbezogenen Daten —
  HTTPS und Zugangsschutz kommen mit req-004 und req-002.
- Secrets stehen nur in `/home/kruianer/knipsa-env/*.env` auf dem
  Beelink — nie im Repo, nie in der Compose- oder Workflow-Datei, nie im
  Log.
- Ports `8098`/`8099` sind für Knipsa reserviert (8090–8096 belegen
  andere Apps auf dem Beelink).
- Der Worker deployt nie selbst nach prod; prod entsteht nur durch den
  Merge des Betreibers auf `main` (siehe `delivery/devops.md`).
- Vom Betreiber vorab zu erledigen (nicht Teil der Umsetzung): env-Dateien
  anlegen und befüllen, self-hosted Runner registrieren, Branch `dev`
  anlegen, NAS-Pfade für `FOTOS_ROOT` festlegen.

# Out of Scope

- Externer Zugang, HTTPS und Cloudflare-Tunnel (→ req-004).
- Anmeldung und Zugangsschutz (→ req-002).
- Ollama, Embedding-Dienst und deren Container (kommen mit der
  KI-Etappe).
- Überwachung der Sicherung, Health-Vorgaben nach `setup-health`.
