---
id: req-007
title: Index und Abgleich
app: knipsa
area: Archiv
priority: normal
created: 2026-10-10
---

# Goal (Why)

Knipsa soll jederzeit wissen, welche Fotos im Archiv liegen und was in
ihnen steht — ohne dass das Dateisystem seine Rolle als Wahrheit verliert.
Fehlt ein Original oder hat es sich verändert, will ich das sofort sehen,
statt es Jahre später zu bemerken.

# Function (What)

- **Index:** Knipsa liest den Baum `original` (samt Wartebereich) ein. Je
  Foto: Schlüssel, Aufnahmezeit, Bewertung, Farbmarkierung, Stichwörter,
  Titel, Beschreibung, GPS-Koordinaten. Je Datei: Pfad, Größe,
  Änderungszeit, Import- und Bild-Prüfsumme, zugehöriger Sidecar. Bei einer
  NEF gelten die Angaben aus ihrem XMP-Sidecar, ohne Sidecar die aus der NEF.
- **Abgleich:** nach jedem Import, stündlich und per Knopf "Abgleich
  jetzt". Neue Dateien werden aufgenommen, geänderte neu gelesen;
  unveränderte (gleiche Größe und Änderungszeit) nicht erneut gelesen.
- **Vermisst:** jeder Schlüssel aus der Gesehen-Liste, zu dem keine Datei
  mehr existiert. Taucht die Datei wieder auf, ist das Foto wieder normal.
- **Alarm** (bleibt, solange der Zustand besteht): "NEF verändert", wenn
  eine NEF nicht mehr ihrer Import-Prüfsumme entspricht; "Bilddaten
  verändert", wenn bei JPEG oder HEIC die Bild-Prüfsumme abweicht. Neue
  Metadaten in JPEG/HEIC lösen keinen Alarm aus.
- **Referenz:** Die Bild-Prüfsumme wird beim ersten Einlesen zum
  Schlüssel in der Gesehen-Liste vermerkt und nie geändert.
- **Unbekannte Datei:** eine Datei im Baum ohne gültigen Schlüssel im
  Namen wird als Hinweis mit Pfad gemeldet und nicht aufgenommen.
- **Neu aufbauen:** nach der Rückfrage "Index verwerfen und aus den
  Dateien neu einlesen? Fotos und Dateien bleiben unverändert." wird der
  Index verworfen und vollständig neu gelesen.
- **Bereich "Archiv"** auf der Startseite: Anzahl Fotos, Dateien,
  vermisst, Alarme, unbekannte Dateien; letzter Abgleich mit Zeitpunkt
  und Dauer; jede Zahl aufklappbar zur Liste. Feld "Schlüssel
  nachschlagen" zeigt die Angaben eines Fotos als Text. Keine Bilder.
- Import, Abgleich und Neuaufbau laufen nie gleichzeitig.

# Acceptance Criteria

- [x] Given ich importiere `DSC_0412.NEF` als `20190614-101500a`, when
  der Import fertig ist, then zählt der Bereich "Archiv" binnen 1 Minute
  ein Foto mehr, ohne dass ich "Abgleich jetzt" drücke.
- [x] Given die XMP von `20190614-101500a` hat 4 Sterne und das Stichwort
  "Toskana", when ich den Schlüssel nachschlage, then sehe ich 4 Sterne
  und "Toskana".
- [x] Given ich ändere in dieser XMP die Bewertung auf 5 Sterne, when ich
  "Abgleich jetzt" drücke, then zeigt das Nachschlagen 5 Sterne.
- [x] Given ich entferne `20190614-101500a.NEF` aus dem Baum, when ich
  "Abgleich jetzt" drücke, then steht `20190614-101500a` unter "vermisst".
- [x] Given `20190614-101500a.NEF` ist vermisst, when ich die Datei
  zurücklege und abgleiche, then steht sie NICHT mehr unter "vermisst".
- [x] Given an `20190614-101500a.NEF` wird ein Byte angehängt, when ich
  abgleiche, then erscheint der Alarm "NEF verändert" für diesen
  Schlüssel.
- [x] Given ein HEIC bekommt eine neue Bewertung in die Datei geschrieben,
  when ich abgleiche, then erscheint KEIN Alarm und das Nachschlagen
  zeigt die neue Bewertung.
- [x] Given die Bilddaten eines JPEG werden verändert (z.B. zugeschnitten),
  when ich abgleiche, then erscheint der Alarm "Bilddaten verändert".
- [x] Given ein Alarm "NEF verändert" steht an, when ich die
  ursprüngliche Datei zurücklege und abgleiche, then ist der Alarm weg.
- [x] Given ich kopiere `urlaub.jpg` von Hand nach
  `original/_wartend/2019-06/`, when ich abgleiche, then erscheint sie
  als "unbekannte Datei" und zählt NICHT als Foto.
- [x] Given 10.000 Dateien im Baum und keine Änderung seit dem letzten
  Lauf, when ich "Abgleich jetzt" drücke, then zeigt der Bereich eine
  Dauer von höchstens 2 Minuten.
- [x] Given der Index kennt 120 Fotos, davon 1 vermisst, when ich "Neu
  aufbauen" bestätige, then zeigt der Bereich danach wieder 120 Fotos und
  denselben vermissten Schlüssel.
- [x] Given ein Import läuft, when ich "Neu aufbauen" drücke, then
  erscheint "Import läuft — bitte warten" und der Index bleibt
  unverändert.
- [ ] Given ein Abgleich oder Neuaufbau läuft, when er fertig ist, then
  ist KEIN Foto, Sidecar oder Ordner im Foto-Baum verändert (einzige
  erlaubte Änderung: neue Einträge in der Gesehen-Liste).

# Constraints

- Das Dateisystem ist die Wahrheit: Alles im Index muss sich aus dem
  Foto-Baum und der Gesehen-Liste neu aufbauen lassen.
- Der Abgleich ändert keine Dateien im Foto-Baum.
- Die Seite ist vorerst ohne Login nur im Heim-WLAN erreichbar und zeigt
  keine Bilder (siehe `delivery/security.md`).

# Out of Scope

- Großes JPEG und Vorschau (Etappe 3), Viewer.
- Bäume `jpeg` und `vorschau`, Varianten, Exporte.
- Ortsnamen aus GPS, Karte, Anlässe.
- Metadaten zurückschreiben, Bewerten in Knipsa.
- Alarme quittieren; Mitteilungen aufs iPhone; Cockpit mit Ampeln.
