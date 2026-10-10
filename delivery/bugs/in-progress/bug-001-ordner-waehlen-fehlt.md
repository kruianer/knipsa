---
id: bug-001
app: knipsa
req: req-006
priority: normal
created: 2026-10-10
---

# Observed

Auf der Import-Seite (dev, http://192.168.2.200:8098) gibt es bei einem
eingesteckten Datenträger keinen Knopf "Ordner wählen …". Einstecken,
Erscheinen in der Quellen-Liste und Verschwinden nach dem Herausziehen
funktionieren.

# Expected

Neben "Importieren" steht bei jedem Datenträger "Ordner wählen …". Er
zeigt die Ordner des Mediums Ebene für Ebene (Ordnername und Anzahl
Dateien); "Diesen Ordner importieren" startet den Lauf nur für diesen
Ordner samt Unterordnern (siehe req-006).

# Steps

1. USB-Stick mit Unterordnern am Beelink einstecken.
2. http://192.168.2.200:8098 öffnen — der Stick erscheint in der
   Quellen-Liste.
3. Beim Stick gibt es nur "Importieren", kein "Ordner wählen …".

# Ursache

Der Knopf fehlte nie — er stand außerhalb des Bildes. Server und Viewer
sind in Ordnung: `/api/import` meldet den Datenträger mit
`art: "datentraeger"`, und der ausgelieferte Viewer zeichnet dafür
"Ordner wählen …" (beides auf dev nachgesehen).

Die Zeile einer Quelle war `display: flex` ohne Umbruch, der Name mit
`min-width: 12rem` fest. Im Browser nachgemessen braucht eine Zeile mit
Datenträger so 480 px. Auf dem iPhone (390 px im Hochformat) ist nach
"Importieren" Schluss: "Ordner wählen …" beginnt erst bei 422 px, also
hinter dem rechten Rand — unsichtbar und nicht zu drücken, ohne dass
etwas auf ein fehlendes Stück hinweist. Auf dem Laptop (60rem) passte
die Zeile, darum fiel es bei der Abnahme von req-006 nicht auf.

# Behebung

Die Quellen-Zeile bricht um (`flex-wrap: wrap`), und der Name erzwingt
seine 12rem nur noch, solange die Zeile sie hergibt
(`min-width: min(12rem, 100%)`). Auf dem iPhone stehen die Knöpfe damit
in der zweiten Zeile, auf dem Laptop bleibt die Zeile wie bisher.
Nachgeprüft im Browser bei 320, 390 und 1280 px: beide Knöpfe liegen
vollständig im Bild.
