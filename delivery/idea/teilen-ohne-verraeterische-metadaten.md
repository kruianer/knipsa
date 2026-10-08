---
titel: Teilen ohne verräterische Metadaten
datum: 2026-10-08
---

## Problem/Nutzen

Wer Fotos selbst hostet, tut das meist genau deshalb, weil er nicht
möchte, dass seine Bilder bei einem Cloud-Anbieter liegen. Sobald ein
Bild aber wieder nach draußen geht — per Freigabe-Link, per Download,
per Weiterleitung an Familie oder Handwerker — reist in der Datei
standardmäßig alles mit, was die Kamera hineingeschrieben hat: GPS-
Koordinaten auf wenige Meter genau, Aufnahmezeitpunkt, Kamera- und
Handy-Modell, teilweise Seriennummern und Besitzername.

Das ist bei privaten Fotos kein abstraktes Risiko, sondern das konkrete:
Ein einzelnes Bild aus dem Garten oder dem Kinderzimmer gibt die
Wohnadresse preis. Ein Bild vom Urlaubsort verrät, dass gerade niemand
zu Hause ist. Wer sein Archiv selbst betreibt, um die Kontrolle zu
behalten, verliert sie an genau der Stelle wieder, an der er sie am
wenigsten erwartet — beim harmlos aussehenden Teilen.

Nutzen: knipsa wird zu dem Foto-Manager, bei dem Teilen von sich aus
sicher ist und nicht erst nach einer Einstellung, die niemand findet.
Das ist ein Alleinstellungsmerkmal gegenüber den großen Diensten, es
passt zum Selbst-Hosten als Motiv, und es kostet den Nutzer keinen
einzigen zusätzlichen Klick. Nebenbei bleibt der eigentliche Wert der
Metadaten erhalten: Sie verschwinden nur aus der Kopie, die das Haus
verlässt, nicht aus dem Archiv, in dem nach Ort und Zeit gesucht wird.

## Skizze

**Grundhaltung:** Das Original bleibt immer unangetastet. Bereinigt wird
ausschließlich die Kopie, die ausgeliefert wird — und zwar auf dem Weg
nach draußen, nicht beim Import.

**Was bereinigt wird.** Drei Stufen, als Voreinstellung pro Freigabe
wählbar, Stufe 2 ist der Standard:

1. *Alles behalten* — für den Fall, dass bewusst die vollen Daten
   übergeben werden sollen (z.B. Übergabe an einen Fotografen).
2. *Standort und Gerät entfernen* — GPS, Kamera-Seriennummer,
   Besitzername, Software-Felder. Aufnahmedatum und Orientierung
   bleiben, damit das Bild beim Empfänger richtig herum und zeitlich
   sortierbar ankommt.
3. *Nur das Bild* — sämtliche Metadaten außer der für die korrekte
   Darstellung nötigen Orientierung.

**Wo es greift.** An jedem Ausgang, nicht nur am offensichtlichsten:
Freigabe-Link, Einzel-Download, Album-Download als Archiv, und die
Bilder, die ein Freigabe-Link im Browser anzeigt. Ein Ausgang, der die
Bereinigung umgeht, macht das ganze Versprechen wertlos — die Regel
gehört daher an die Stelle, die Bilddaten ausliefert, und nicht in die
einzelnen Oberflächen.

**Sichtbarkeit.** Beim Erzeugen einer Freigabe steht in einem Satz da,
was der Empfänger sehen wird, z.B. „Standort und Gerätedaten werden
entfernt — Aufnahmedatum bleibt". Keine Ankreuzfelder mit
Feldnamen-Kauderwelsch. Im Archiv selbst bleibt sichtbar, welche Fotos
überhaupt Standortdaten tragen, damit der Nutzer sein eigenes Archiv
einschätzen kann.

**Was bewusst nicht dazugehört.** Keine nachträgliche Bereinigung des
Archivs auf Knopfdruck (zerstörerisch, eigene Idee), kein Entfernen
sichtbarer Bildinhalte wie Gesichter oder Nummernschilder (anderes
Problem, andere Mittel), keine Wasserzeichen.

**Offene Frage für die Umsetzung:** Ob bereinigte Kopien zwischen-
gespeichert werden (schneller bei wiederholtem Abruf eines Links) oder
bei jedem Abruf neu erzeugt werden (kein zweiter Ort, an dem Bilddaten
liegen). Im Zweifel die zweite Variante — sie ist die, die zum Motiv
„ich hoste selbst, weil ich die Kontrolle will" passt.
