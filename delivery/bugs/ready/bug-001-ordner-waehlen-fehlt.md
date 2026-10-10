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
