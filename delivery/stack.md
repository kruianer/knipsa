---
project: knipsa
template: custom (Node/TS + Python-Dienst, aus Konzept)
---

# Tech Stack

This file is binding for the autonomous worker. Follow it exactly.

## Languages & Frameworks

- Pipeline (Ingest, Abgleich, Sync, Sortierer, Worker): TypeScript auf Node
- Server/API: TypeScript auf Node mit Fastify
- Viewer: reines TypeScript mit Vite (kein UI-Framework), Service Worker
  über Workbox, IndexedDB über `idb`, Karte mit MapLibre GL JS
- Metadaten: `exiftool`, aus Node angesteuert (`exiftool-vendored`)
- Bildgrößen: `sharp`; HEIC: `libheif` mit `libde265` im Container,
  Umwandlung per `heif-dec` in ein Zwischenbild, danach `sharp`
  (Metadaten liest `exiftool` direkt aus dem HEIC)
- Database & Warteschlange: PostgreSQL mit `pgvector`, Zugriff über
  Kysely (inkl. Kysely-Migrationen)
- Beschreibung/Stichwörter: Ollama per HTTP
- Bild-Embeddings: kleiner Python-Dienst im Container per HTTP
  (Kandidat SigLIP 2) — entfällt, falls `transformers.js` reicht
- Betrieb: Docker Compose auf dem Beelink, HTTPS und Erreichbarkeit über
  Cloudflare-Tunnel (`cloudflared`-Container, siehe `delivery/devops.md`)
- Node-Version: 24 LTS (`.nvmrc`, `engines`, Basis-Image `node:24-slim`)
- Python-Version: 3.12, verwaltet mit `uv`

## Commands

The worker runs these; keep them copy-pasteable and current.

- Install: `pnpm install`
- Build:   `pnpm -r build`
- Test:    `pnpm -r test` (Vitest)
- Lint:    `pnpm lint` (ESLint)
- Format:  `pnpm format` (Prettier)
- Types:   `pnpm typecheck` (`tsc --noEmit` je Paket)
- E2E:     `pnpm e2e` (Playwright, Viewer)
- Python-Dienst (in `services/embedding`): Install `uv sync`,
  Test `uv run pytest`, Lint `uv run ruff check`, Format `uv run ruff format`

## Testing

Binding test policy for the worker.

- Every requirement is delivered with automated tests covering its
  acceptance criteria. A change with no test for its behavior is not
  done.
- Every bug fix starts with a failing test that reproduces the bug,
  then the fix makes it pass (reproduce-first). No repro test → not
  fixed.
- Test levels: unit for logic; integration for anything crossing a
  boundary (DB, API, external service); E2E only for critical user
  flows, kept few and stable.
- The full test suite (see Commands) must pass before promotion to
  prod — this is the automated half of the quality gate; the user's
  manual acceptance on the dev URL is the other half.
- Integrationstests laufen gegen echtes PostgreSQL mit pgvector (Docker)
  und echtes `exiftool`, nicht gemockt.
- Tests arbeiten nur in temporären Verzeichnissen mit Testbildern
  (NEF, JPEG, HEIC, XMP) — nie auf einem echten Foto-Baum.
- Ollama und der Embedding-Dienst werden in Unit- und Integrationstests
  durch Stubs ersetzt.

## Conventions

- Formatting/linting is enforced by the tools above; run them before
  considering a change done.
- Folder structure (pnpm-Workspace): `packages/shared` (Typen, Schlüssel,
  Pfadlogik), `packages/pipeline`, `packages/server`, `packages/viewer`,
  `services/embedding` (Python), `deploy/` (Compose, Proxy).
- TypeScript `strict`, ESM, keine `any` ohne Begründung im Kommentar.
- Domänenbegriffe im Code wie im Glossar, deutsch ohne Umlaute
  (`foto`, `datei`, `anlass`, `gesehen`); technische Bezeichner englisch.
- Wurzel des Foto-Baums (`/fotos`) und alle Hosts kommen aus
  Umgebungsvariablen, nie fest im Code.
- Dateioperationen auf `original` nur über eine zentrale Modul-Schicht
  in `packages/shared`, die Kopieren-Prüfen-Aufräumen und Papierkorb
  statt Löschen erzwingt.
- DB-Schema nur über Kysely-Migrationen ändern.

## Glossary

Domain terms used consistently across requirements, bugs, and code.
capture-requirement checks new terms against this list and adds them
here.

| Term | Meaning |
|------|---------|
| Foto | Eine Aufnahme; kann mehrere Dateien haben (Original, Varianten, Sidecars) |
| Datei | Eine Datei im `original`-Baum, gehört zu genau einem Foto |
| Schlüssel | `JJJJMMTT-HHMMSS` + Buchstabe; archivweit eindeutig, nie geändert, nie wiederverwendet |
| Anlass | Zeitraum mit Ort (Reise, Ausflug, Fest); Ordner `JJJJ-MM-TT_name` mit `anlass.json` |
| Alltag | Fotos ohne Anlass, ein Ordner pro Monat `JJJJ-MM_alltag` |
| Wartend | Importiert und gesichert, Anlass noch nicht bestätigt (`original/_wartend`) |
| Variante | Weitere Datei desselben Fotos aus Lightroom, Zusatz `-a`, `-b`, … |
| Führende Datei | Datei eines Fotos, die Bewertung/Stichwörter liefert; neueste Variante, außer manuell gewählt |
| Sidecar | `.xmp`/`.acr` neben einer NEF; Feld der Datei, keine eigene Zeile |
| Großes JPEG | Je Foto ein JPEG im `jpeg`-Baum (Export oder extrahiertes Kamerabild) |
| Vorschau | Kleines JPEG im `vorschau`-Baum, jederzeit neu erzeugbar |
| Export | JPEG aus Lightroom über `eingang/export`; Zustand aktuell / veraltet / fehlt |
| Rücklauf | "Original + Einstellungen" aus der Lightroom-Cloud über `eingang/ruecklauf` |
| Import-Prüfsumme | Prüfsumme der ganzen Datei beim Eingang, nie aktualisiert |
| Bild-Prüfsumme | Prüfsumme nur der Bilddaten; dauerhafte Identität eines Fotos |
| Gesehen-Liste | Jede je importierte Datei mit Import-Prüfsumme, Schlüssel, früheren Namen; nicht neu aufbaubar |
| Abgleich | Lauf, der Dateibaum und Datenbank vergleicht |
| Neu aufbauen | Datenbank verwerfen und alles aus den Dateien neu einlesen |
| Fremdquelle | Karte, iPhone, fremder Datenträger: nur lesen, nie löschen |
| Durchgang | `eingang/*`-Ordner: Dateien werden nach Prüfung entfernt |
| Problemordner | `eingang/problem`: nicht verarbeitbare Dateien mit Begründung |
| Ausleihe | Ordner ist zur Bearbeitung an ein Gerät (PC/Laptop) kopiert |
| Cockpit | Seite mit Zustand von Import, Verarbeitung, Ausleihen, Sicherung |
