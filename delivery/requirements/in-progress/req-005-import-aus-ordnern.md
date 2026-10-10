---
id: req-005
title: Import aus Ordnern
app: knipsa
area: Ingest
priority: normal
created: 2026-10-10
---

# Goal (Why)

Ich will Fotos — zuerst den Altbestand — sicher und ohne Doppelte ins
Archiv bringen. Jedes Foto bekommt dabei seinen dauerhaften Schlüssel und
liegt geprüft im Wartebereich, bis später sein Anlass feststeht. Die
Quelle bleibt dabei unangetastet.

# Function (What)

- **Quellen:** eine eingestellte Liste von Ordnern auf dem Beelink (je
  Name und Pfad). Jede Quelle wird samt Unterordnern gelesen, aber nie
  verändert.
- **Seite "Import"** auf der Knipsa-Startseite: je Quelle Name,
  verfügbar/nicht verfügbar und Knopf "Importieren"; während eines Laufs
  Fortschritt "x von y Dateien"; danach das Ergebnis. Es werden keine
  Bilder angezeigt.
- **Fotos** sind NEF, JPEG und HEIC. Ein XMP- und ein ACR-Sidecar mit
  gleichem Grundnamen im selben Ordner gehören zur NEF und werden mit ihr
  als Einheit übernommen.
- **Schlüssel:** `JJJJMMTT-HHMMSS` aus der in der Datei gespeicherten
  Aufnahmezeit (unverändert, keine Zeitzonen-Umrechnung) plus Buchstabe
  `a`–`z`, danach `za`, `zb`, …. Fotos derselben Sekunde bekommen die
  Buchstaben in Aufnahmereihenfolge (Sekundenbruchteil, sonst
  ursprünglicher Dateiname aufsteigend). Ein Schlüssel ist im ganzen
  Archiv eindeutig und wird nie wiederverwendet — vergeben wird der
  nächste freie Buchstabe.
- **Ablage:** `original/_wartend/JJJJ-MM/<Schlüssel>.<Endung>` im
  Foto-Baum, Endung unverändert aus der Quelle; Sidecars unter demselben
  Schlüssel. Jede Datei wird bytegleich kopiert und erst nach geprüfter
  Prüfsumme als importiert vermerkt.
- **Gesehen-Liste:** je importierter Datei Import-Prüfsumme, Schlüssel,
  Quelle, ursprünglicher Ordner und Dateiname, Zeitpunkt. Eine Datei mit
  bekannter Import-Prüfsumme gilt als "schon bekannt" und wird nicht
  erneut importiert — egal, wo und unter welchem Namen sie liegt.
- **Problemfälle** (beschädigt, ohne Aufnahmezeit, Sidecar ohne Foto)
  kommen als Kopie mit Begründung nach `eingang/problem`; eine identische
  Datei dort wird nicht ein zweites Mal abgelegt.
- **Übersprungen** (nicht kopiert, im Ergebnis mit Grund gezählt): Videos
  und alle anderen Dateitypen; ein JPEG neben einer gleichnamigen NEF;
  ein Sidecar zu einer schon bekannten NEF ("nicht übernommen").
- **Ergebnis:** die letzten 10 Läufe mit Quelle, Zeitpunkt und Anzahl
  neu / schon bekannt / übersprungen / Problem; aufklappbar je Datei
  `ursprünglicher Pfad → Schlüssel` bzw. Grund. Jeder Lauf schreibt
  zusätzlich ein Protokoll als Datei in den Foto-Baum.
- Es läuft immer nur ein Import gleichzeitig.

# Acceptance Criteria

- [x] Given die Quelle "Test" enthält `Toskana 2019/DSC_0412.NEF`,
  aufgenommen am 14.06.2019 um 10:15:00, when ich "Importieren" drücke,
  then zeigt das Ergebnis `Toskana 2019/DSC_0412.NEF →
  _wartend/2019-06/20190614-101500a.NEF`.
- [x] Given neben `DSC_0412.NEF` liegt `DSC_0412.xmp`, when ich
  importiere, then erscheint im Ergebnis auch `DSC_0412.xmp →
  _wartend/2019-06/20190614-101500a.xmp`.
- [x] Given drei Fotos einer Serie, alle aufgenommen am 14.06.2019 um
  10:16:05, when ich importiere, then bekommen sie in Aufnahmereihenfolge
  die Schlüssel `20190614-101605a`, `…b` und `…c`.
- [x] Given `20190614-101500a` ist schon vergeben, when ich ein anderes
  Foto derselben Sekunde importiere, then bekommt es `20190614-101500b`.
- [x] Given die Quelle "Test" wurde bereits vollständig importiert, when
  ich erneut importiere, then meldet das Ergebnis 0 neu und alle Fotos als
  "schon bekannt".
- [x] Given dieselbe Datei liegt umbenannt als `kopie.NEF` in einem
  anderen Unterordner der Quelle, when ich importiere, then gilt sie als
  "schon bekannt".
- [x] Given ein JPEG ohne gespeicherte Aufnahmezeit, when ich importiere,
  then erscheint es im Ergebnis als Problem mit dem Grund "keine
  Aufnahmezeit".
- [x] Given `DSC_0500.xmp` ohne zugehörige NEF, when ich importiere, then
  erscheint sie als Problem mit dem Grund "Sidecar ohne Foto".
- [x] Given `IMG_0001.MOV` und `DSC_0413.JPG` neben `DSC_0413.NEF`, when
  ich importiere, then erscheinen beide als "übersprungen" mit ihrem Grund.
- [x] Given `DSC_0412.NEF` ist schon importiert und in der Quelle liegt
  inzwischen eine geänderte `DSC_0412.xmp`, when ich importiere, then
  erscheint der Hinweis "Sidecar zu bekanntem Foto nicht übernommen".
- [x] Given ein Import läuft, when ich die Seite neu lade, then sehe ich
  weiterhin den Fortschritt "x von y Dateien".
- [x] Given ein Import läuft, when ich bei einer anderen Quelle
  "Importieren" drücke, then erscheint "Import läuft bereits" und kein
  zweiter Lauf startet.
- [x] Given der Server wird mitten in einem Lauf neu gestartet, when ich
  danach erneut importiere, then sind alle Fotos genau einmal mit je einem
  Schlüssel im Ergebnis, und keine halb kopierte Datei liegt im
  Wartebereich.
- [x] Given ein Import ist fertig, when ich die Quelle ansehe, then ist
  dort KEINE Datei gelöscht, umbenannt oder verändert.
- [ ] Given es gab 11 Läufe, when ich die Seite öffne, then sehe ich
  genau die 10 neuesten.

# Constraints

- Quellen sind Fremdquellen: Knipsa liest sie nur und verändert oder
  löscht dort nie etwas.
- Originale werden bytegleich übernommen; eine NEF wird nie verändert.
- Die Seite ist vorerst ohne Login nur im Heim-WLAN erreichbar und zeigt
  deshalb keine Bilder (siehe `delivery/security.md`).
- Die Quell-Ordner werden in der Konfiguration der Umgebung eingestellt,
  nicht auf der Seite.
- Auf prod erst benutzen, wenn der Foto-Baum auf das NAS zeigt (siehe
  `delivery/devops.md`); bis dahin wird nur auf dev importiert.

# Out of Scope

- SD-Karte und USB als Quelle, Abbrechen eines Laufs, Meldung
  "vollständig importiert" (→ req-006).
- Quellen auf PC oder Laptop.
- Quell-Ordner auf der Seite verwalten.
- Varianten aus Lightroom (z.B. DNG, `-Enhanced-NR`) und Übernahme von
  Sidecars zu schon bekannten Fotos.
- Datenbank, Bild-Prüfsumme, großes JPEG und Vorschau, Anlässe und
  Einsortieren aus dem Wartebereich.
- Schreiben von Metadaten (Anlass, ursprünglicher Name) in die Fotos.
