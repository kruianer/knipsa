---
id: req-006
title: Import von Karte und USB
app: knipsa
area: Ingest
priority: normal
created: 2026-10-10
---

# Goal (Why)

Ich will die SD-Karte der Kamera oder einen USB-Stick am Beelink
einstecken und die Fotos darauf importieren — und danach sicher wissen,
ob ich die Karte formatieren darf. Ein langer Import soll sich jederzeit
sauber abbrechen lassen.

# Function (What)

Erweitert den Import aus req-005; Schlüssel, Ablage, Gesehen-Liste,
Problemfälle, Übersprungenes und Ergebnis gelten unverändert wie dort.

- **Datenträger als Quelle:** Jeder am Beelink eingesteckte Datenträger
  erscheint in der Quellen-Liste mit Bezeichnung und Größe (z.B.
  `NIKON D750 (64 GB)`) und verschwindet nach dem Herausziehen — jeweils
  binnen 10 Sekunden, ohne Neuladen der Seite.
- **Ganz oder Ordner:** "Importieren" importiert das ganze Medium samt
  Unterordnern. "Ordner wählen …" zeigt die Ordner des Mediums Ebene für
  Ebene (Ordnername und Anzahl Dateien); "Diesen Ordner importieren"
  startet den Lauf für diesen Ordner samt Unterordnern.
- **Abbrechen** (für alle Quellen, auch Ordner aus req-005): beendet den
  Lauf nach der gerade bearbeiteten Datei. Alles bis dahin bleibt sauber
  importiert; das Ergebnis zeigt "abgebrochen" mit den Zahlen bis dahin.
- **Herausziehen während des Laufs:** Der Lauf endet mit "abgebrochen —
  Datenträger entfernt"; es bleibt keine halb kopierte Datei zurück.
- **Fortsetzen:** Ein erneuter Import derselben Quelle importiert nur,
  was noch fehlt (bereits Importiertes gilt als "schon bekannt").
- **Vollständig:** Nach einem Lauf über das ganze Medium ohne Abbruch und
  ohne Problemfall zeigt das Ergebnis "Vollständig im Archiv — kann
  formatiert werden". Nach einem Ordner-Lauf (Ordner-Quelle oder
  Unterordner eines Mediums) steht nur "Vollständig im Archiv" bzw.
  "Ordner <Name> vollständig im Archiv", ohne Formatier-Hinweis.

# Acceptance Criteria

- [x] Given die Seite "Import" ist offen, when ich eine SD-Karte mit der
  Bezeichnung `NIKON D750` einstecke, then erscheint sie binnen 10
  Sekunden als `NIKON D750 (64 GB)` in der Quellen-Liste, ohne dass ich
  neu lade.
- [x] Given die Karte steht in der Liste, when ich sie herausziehe, then
  verschwindet sie binnen 10 Sekunden aus der Liste.
- [x] Given die Karte enthält `DCIM/100NIKON` und `DCIM/101NIKON`, when
  ich über "Ordner wählen …" `DCIM/101NIKON` importiere, then enthält das
  Ergebnis nur Dateien aus `DCIM/101NIKON`.
- [x] Given ein Import mit 200 Dateien läuft, when ich nach etwa 50
  Dateien "Abbrechen" drücke, then endet der Lauf als "abgebrochen" und
  die bis dahin importierten Fotos liegen vollständig im Wartebereich.
- [x] Given ein Import aus der Ordner-Quelle "Test" läuft, when ich
  "Abbrechen" drücke, then endet auch dieser Lauf als "abgebrochen".
- [ ] Given ein Import von der Karte läuft, when ich die Karte
  herausziehe, then endet der Lauf mit "abgebrochen — Datenträger
  entfernt".
- [ ] Given ein Lauf wurde abgebrochen, when ich dieselbe Quelle erneut
  importiere, then werden nur die noch fehlenden Fotos als "neu"
  importiert und die übrigen als "schon bekannt" gezählt.
- [ ] Given die ganze Karte wurde ohne Abbruch und ohne Problemfall
  importiert, when ich das Ergebnis ansehe, then steht dort "Vollständig
  im Archiv — kann formatiert werden".
- [ ] Given beim Import der ganzen Karte gab es 1 Problemfall, when ich
  das Ergebnis ansehe, then steht dort NICHT "kann formatiert werden",
  sondern "nicht vollständig — 1 Problemfall".
- [ ] Given nur der Ordner `DCIM/101NIKON` wurde fehlerfrei importiert,
  when ich das Ergebnis ansehe, then steht dort "Ordner 101NIKON
  vollständig im Archiv" und KEIN Formatier-Hinweis.
- [ ] Given ein Import läuft, when ich ihn ansehe, then wird auf dem
  Datenträger KEINE Datei gelöscht, umbenannt oder verändert.

# Constraints

- Der Beelink (Ubuntu Server ohne Desktop) hängt eingesteckte Datenträger
  automatisch NUR LESEND unter `/media/knipsa/<Bezeichnung>` ein; ohne
  Bezeichnung unter einem Ersatznamen. Das ist Host-Einrichtung durch den
  Betreiber (`deploy/host/automount/`), nicht Teil der Umsetzung; diese
  Dateien nicht ändern. Datenträger, die der Beelink nicht einhängen kann,
  erscheinen nicht. Nach dem Herausziehen kann ein leerer Ordner einige
  Sekunden stehen bleiben — als Datenträger gilt nur ein tatsächlich
  eingehängter Ordner.
- Datenträger, die nach dem Start von Knipsa eingesteckt werden, müssen
  ohne Neustart der App sichtbar werden.
- Karte, Stick und Platte sind Fremdquellen: nur lesen, nie löschen. Das
  Formatieren macht der Betreiber selbst in der Kamera.

# Out of Scope

- Import vom iPhone.
- Automatischer Import beim Einstecken (Import startet immer per Knopf).
- Mitteilung aufs iPhone.
- Aushängen per Knopf (die Datenträger sind nur lesend eingehängt und
  können jederzeit gezogen werden).
- Fragen nach Ordner oder Anlass bei unbekannten Datenträgern.
