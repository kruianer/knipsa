---
project: knipsa
---

# Vision

Verbindlicher Kompass für den autonomen Worker. Lässt ein Requirement
eine Grauzone offen, entscheide sie im Sinne der Prinzipien unten.

## Problem (Why)

Kamera- und Handyfotos liegen verstreut, Lightroom ist schwach im Ansehen
und Wiederfinden, und die großen Foto-Apps zeigen nur ein gleichförmiges
Raster. Knipsa ist ein eigener Foto-Viewer (Web-App, auch offline) mit
einer Pipeline auf dem Beelink, die Fotos automatisch einsortiert,
sichert, verkleinert und lokal beschreibt — Lightroom bleibt nur zum
Entwickeln.

## Audience

Nur der Betreiber selbst, privat unter `knipsa.kremmel.org`, auf iPhone
(Home-Screen-App) und Laptop (Browser). Kein weiterer Nutzer.

## Guiding Principles (tie-breakers)

- Im Zweifel: Datei vor Datenbank — alles Wertvolle steht in offenen
  Standards bei der Datei, die DB muss sich daraus neu aufbauen lassen.
- Im Zweifel: bewahren vor aufräumen — nichts ändern oder löschen, sondern
  melden (Problemordner, Konflikt) statt raten.
- Im Zweifel: feste Regeln vor KI — KI schlägt nur vor, entscheidet nie.
- Im Zweifel: Entscheidung des Nutzers vor Automatik — eine manuelle
  Festlegung wird nie automatisch überschrieben.
- Im Zweifel: schnell und offline vor vollständig — lieber ein Ersatzbild
  mit Vermerk als eine Ladepause.

## Non-Goals

- Kein Raw-Entwickler und kein Lightroom-Katalog als Zentrale —
  Entwickeln bleibt bei Adobe.
- Keine Backup-Lösung — Sicherung macht das NAS, Knipsa überwacht nur.
- Keine Cloud-Dienste oder Cloud-KI mit laufenden Kosten pro Foto —
  alles läuft auf eigener Hardware.
- Keine Gesichtserkennung in der ersten Ausbaustufe.
- Keine öffentliche Version, keine Mehrbenutzer-Funktionen, keine native App.
