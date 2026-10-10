---
project: knipsa
setup: 1
---

# DevOps Convention

This file is binding for the autonomous worker. Follow it exactly.

## Environments

| Environment | Branch | URL (aktuell, nur LAN)       | URL (Ziel, ab req-004)           |
|-------------|--------|------------------------------|----------------------------------|
| dev         | dev    | http://192.168.2.200:8098    | https://dev.knipsa.kremmel.org   |
| prod        | main   | http://192.168.2.200:8099    | https://knipsa.kremmel.org       |

Hosting platform: Docker Compose auf dem Beelink (Ubuntu), deployt über
GitHub Actions mit self-hosted Runner auf dem Beelink.

**Übergang:** Bis req-004 umgesetzt ist, sind beide Umgebungen nur im
Heim-WLAN über die IP des Beelink erreichbar (Port nur an
`192.168.2.200` gebunden). Abnahme erfolgt in dieser Zeit über die
LAN-URL. Danach gilt die Ziel-URL, und die LAN-Ports entfallen.

Getrennte Umgebungen auf demselben Host:

| | dev | prod |
|---|---|---|
| Compose-Projekt | `knipsa-dev` | `knipsa-prod` |
| env-Datei (Secrets) | `~/knipsa-env/dev.env` | `~/knipsa-env/prod.env` |
| Datenbank | eigene Postgres-DB `knipsa_dev` | eigene Postgres-DB `knipsa_prod` |
| Foto-Baum | Test-Baum `<TODO: Pfad, z.B. NAS:/fotos-dev>` | echter Baum `<TODO: Pfad, z.B. NAS:/fotos>` |
| Gesehen-Liste | im Test-Baum | im echten Baum (wird gesichert) |

- dev arbeitet NIE auf dem echten Foto-Baum, auch nicht lesend. Der
  Test-Baum enthält eine Kopie einiger Anlässe und darf jederzeit
  verworfen und neu befüllt werden.
- Secrets stehen nur in den env-Dateien auf dem Beelink, nie im Repo,
  nie in der Compose-Datei, nie in Workflow-Dateien.

## Deploy Trigger

- Push to `dev`  → auto-deploy to the dev environment.
- Merge to `main` → auto-deploy to prod.

No manual deploy step; git push is the trigger.

Ablauf je Deploy (Workflow in `.github/workflows/`, Job läuft auf dem
self-hosted Runner): Install → Lint → Typecheck → Test (siehe
`delivery/stack.md`) → `docker compose -p knipsa-<env> build` →
Migrationen → `docker compose -p knipsa-<env> up -d` → Health-Check der
URL. Schlägt ein Schritt fehl, bleibt die laufende Version stehen.

## Promotion (dev → prod)

- Promotion happens ONLY via a Pull Request from `dev` to `main`.
- ONLY the user merges that PR. The worker opens it at most; it never
  merges to `main` and never deploys to prod itself.

## Acceptance / Quality Gate

- The user accepts changes on the dev/staging URL above before
  promotion.
- A change that is not manually verifiable on the dev URL is not ready.
- Die volle Testsuite muss im Deploy-Workflow grün sein, bevor dev oder
  prod neu gestartet wird.

## Hard Rules

- The worker commits only to `dev`.
- The worker NEVER deploys to prod, never merges to `main`, never pushes
  to `main` directly.
- Der Worker führt auf dem Beelink keine `docker compose`-Befehle gegen
  `knipsa-prod` aus und fasst weder `prod.env`, die prod-Datenbank noch
  den echten Foto-Baum an.

## Externer Zugang

Kein Port am Router — weder für Web noch für SSH. Alles läuft über
Cloudflare-Tunnel, die von innen nach außen aufbauen.

**Web (je Umgebung ein eigener Tunnel) — geplant, umgesetzt mit req-004:**

| Umgebung | Hostname | Tunnel | Ziel | Token in |
|---|---|---|---|---|
| dev | `dev.knipsa.kremmel.org` | `knipsa-dev` | `http://server:3000` | `~/knipsa-env/dev.env` |
| prod | `knipsa.kremmel.org` | `knipsa-prod` | `http://server:3000` | `~/knipsa-env/prod.env` |

- Der Tunnel läuft als `cloudflared`-Container im jeweiligen
  Compose-Projekt, ohne `ports:`. Variable: `CLOUDFLARE_TUNNEL_TOKEN`.
- HTTPS kommt von Cloudflare; auch im Heim-WLAN wird die App über diesen
  Hostnamen aufgerufen.

**SSH zum Beelink (einer pro Maschine, besteht bereits):**

- Hostname `ssh.cellarvoice.com` → `ssh://localhost:22`, systemd-Dienst
  `cloudflared-ssh.service` auf dem Host, abgesichert durch Cloudflare
  Access (nur die E-Mail des Betreibers, Einmal-Code, 24 h).
- `sshd`: `PasswordAuthentication no`, `PermitRootLogin no`, Anmeldung
  nur per Schlüssel.
- Der Assistent verbindet sich mit `ssh beelink-tunnel` (über
  `cloudflared access ssh`, funktioniert überall) oder im WLAN mit
  `ssh beelink`. Er nutzt Access-Sitzung und Schlüssel des Betreibers und
  hat keinen eigenen Zugang. Ist die Access-Sitzung abgelaufen, muss der
  Betreiber sie im Browser bestätigen.

## Notwege

- **Zugang komplett verloren** (kein Gerät, E-Mail nicht erreichbar):
  Nur der Betreiber, per SSH auf dem Beelink, löscht in der Datenbank der
  betroffenen Umgebung die Einträge in `nutzer` (samt `passkey`,
  `sitzung`, `mitgliedschaft`). Danach erscheint "Ersteinrichtung
  starten" wieder — sofort selbst ausführen. Der Worker tut das nie.
