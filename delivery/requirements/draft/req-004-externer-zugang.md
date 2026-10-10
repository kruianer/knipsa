---
id: req-004
app: knipsa
area: Betrieb
created: 2026-10-10
---

> **Status draft:** Erst nach `ready/` verschieben, wenn der Betreiber die
> Tunnel `knipsa-dev` und `knipsa-prod` im Cloudflare-Konto angelegt und
> die Tokens in die env-Dateien eingetragen hat.

# Goal (Why)

Baut auf req-001 (Betriebsgerüst) auf. Knipsa soll von überall unter
`https://dev.knipsa.kremmel.org` bzw. `https://knipsa.kremmel.org`
erreichbar sein — auch unterwegs vom iPhone, und mit HTTPS, ohne das
Passkeys (req-002) nicht funktionieren. Wie bei den anderen Apps des
Betreibers ohne offenen Port am Router, über je einen Cloudflare-Tunnel
pro Umgebung.

# Function (What)

- `deploy/docker-compose.yml` bekommt den Dienst `cloudflared`:
  `image: cloudflare/cloudflared:latest`,
  `command: tunnel --no-autoupdate run --token ${CLOUDFLARE_TUNNEL_TOKEN}`,
  **keine** `ports:`. Der Tunnel zeigt auf `http://server:3000`.
- `CLOUDFLARE_TUNNEL_TOKEN` kommt aus der env-Datei der Umgebung und
  steht in `deploy/example.env` (ohne Wert).
- `APP_ORIGIN` wechselt auf `https://dev.knipsa.kremmel.org` bzw.
  `https://knipsa.kremmel.org`.
- Der Server setzt HSTS und behandelt die Anfragen als HTTPS
  (Proxy-Header von Cloudflare vertrauen, nur aus dem Docker-Netz).
- Die LAN-Portbindung aus req-001 (`192.168.2.200:8098/8099`) entfällt;
  danach veröffentlicht kein Knipsa-Container einen Port am Host.

| Umgebung | Hostname | Tunnel | Token in |
|---|---|---|---|
| dev | `dev.knipsa.kremmel.org` | `knipsa-dev` | `~/knipsa-env/dev.env` |
| prod | `knipsa.kremmel.org` | `knipsa-prod` | `~/knipsa-env/prod.env` |

# Acceptance Criteria

- [ ] Given ein Push auf `dev`, when der Workflow durchläuft, then ist
  `https://dev.knipsa.kremmel.org` vom iPhone im Mobilfunknetz erreichbar
  und zeigt die Minimalseite mit gültigem Zertifikat.
- [ ] Given ein Merge auf `main`, when der Workflow durchläuft, then ist
  `https://knipsa.kremmel.org` ebenso erreichbar.
- [ ] Given die laufenden Container, when ich `docker ps` auf dem
  Beelink ansehe, then veröffentlicht kein Knipsa-Container einen Port am
  Host.
- [ ] Given ein Aufruf über den Tunnel, when ich die Antwort-Header
  ansehe, then ist HSTS gesetzt.

# Constraints

- Kein Port am Router. Tunnel-Tokens nur in den env-Dateien, nie im
  Repo, in Compose- oder Workflow-Dateien oder im Log.
- Vom Betreiber vorab zu erledigen (nicht Teil der Umsetzung): Tunnel im
  Cloudflare-Konto der Zone `kremmel.org` anlegen (Public Hostname →
  Service `http://server:3000`) und Token eintragen.

# Out of Scope

- Anmeldung (→ req-002) — bis dahin zeigt die App nur die Minimalseite.
- SSH-Zugang zum Beelink (besteht bereits, siehe `delivery/devops.md`).
