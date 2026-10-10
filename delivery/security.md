---
project: knipsa
---

# Security-Vorgaben

Bindende Vorgabe fuer den Security-Task des autonomen Workers (req-014).
Er prueft bei jedem Lauf das IST des Repos gegen dieses SOLL.

## Erreichbarkeit

- Zugriff: auch von außen, unter `knipsa.kremmel.org` über einen
  Cloudflare-Tunnel — kein offener Port am Router.
- HTTPS: Pflicht, auch im Heimnetz — die App wird immer über ihren
  Tunnel-Hostnamen aufgerufen (TLS durch Cloudflare); kein Klartext-HTTP,
  HSTS gesetzt. Kein Knipsa-Container veröffentlicht einen Port am Host.
- Postgres, Ollama, Embedding-Dienst und alle internen Ports sind nur im
  Docker-Netz erreichbar, nie von außen und nicht im WLAN.

## Zugriffskreis

- Nutzer: nur der Betreiber; keine Mehrbenutzer-Funktionen, vorerst
  keine Gastzugänge.
- Zugangsschutz: Login erforderlich nach dem gemeinsamen Auth-Standard
  (Passkey/Face ID, E-Mail-Link zur Wiederherstellung, siehe
  `setup-auth`). Jede Route außer Login und statischer App-Hülle ist
  geschützt — auch Bilder, Vorschauen und die API.
- Zugriff des Beelink auf PC und Laptop: eigenes Konto nur für die
  Freigabe `D:\fotos`, Zugangsdaten nur als Secret, nie im Repo.
- Secrets (DB-Passwort, Tunnel-Token, Freigabe-Konten) nur über
  Umgebungsvariablen/Secret-Dateien, nie im Repo oder in Logs.

## Backup & Wiederherstellung

- Backup erwartet: ja, durch das NAS (Knipsa überwacht nur):
  Schnappschüsse stündlich und täglich, Hyper Backup auf externe Platte,
  außer Haus verschlüsselt. Gesichert werden `original`, `jpeg`,
  Gesehen-Liste und der nächtliche Datenbank-Dump.
- Gesehen-Liste und DB-Dump liegen auf dem NAS, nicht nur auf dem Beelink.
- Wiederherstellung: muss getestet sein — Probe ein- bis zweimal im Jahr
  gegen die Prüfsummen; das Cockpit mahnt eine fällige Probe an.

## Datenschutz

- Sensible/personenbezogene Daten: ja — private Fotos mit Personen,
  GPS-Orten und Zeitpunkten, KI-Beschreibungen und Embeddings.
- Besondere Anforderungen:
  - Bilder, Metadaten, Beschreibungen und Koordinaten gehen an keinen
    externen Dienst; KI und Geocoding laufen lokal. Erlaubt ist nur das
    Laden von Kartenkacheln (OSM, basemap.at) ohne Bild- oder Fotodaten.
  - Bewusst akzeptierte Ausnahme: der Cloudflare-Tunnel als Transportweg.
  - Außer-Haus-Backup nur verschlüsselt.
  - Keine Analyse-, Tracking- oder Drittanbieter-Skripte im Viewer.
  - Logs enthalten keine Koordinaten, Beschreibungen oder Tokens.
