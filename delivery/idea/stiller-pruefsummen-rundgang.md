---
titel: Stiller Prüfsummen-Rundgang gegen Bit-Fäule
datum: 2026-10-15
---

## Problem/Nutzen

Der Abgleich erkennt eine Datei als unverändert, wenn Größe und
Änderungszeit gleich geblieben sind, und liest sie dann nicht erneut
(`packages/pipeline/src/abgleich.ts`). Das ist richtig, weil ein Lauf
über ein großes Archiv sonst jedes Mal jedes Byte lesen müsste. Es hat
aber eine Lücke: Genau der gefährlichste Schadensfall verändert weder
Größe noch Änderungszeit.

Ein Bit, das auf der Platte oder im NAS kippt, eine Datei, die bei einem
Kopier- oder Spiegel-Vorgang unvollständig ankommt, ein Werkzeug, das
beim Schreiben die Änderungszeit wieder zurücksetzt — in allen drei
Fällen sagt der Abgleich weiterhin "unverändert" und der Alarm
"NEF verändert" bzw. "Bilddaten verändert" schlägt nie an. Der Schaden
ist vorhanden, aber unsichtbar. Er wird erst bemerkt, wenn das Foto
Jahre später geöffnet wird — zu einem Zeitpunkt, an dem auch die
Sicherung längst die kaputte Fassung enthält, weil jede Sicherung die
Datei brav mitgespiegelt hat.

Heute gibt es dagegen genau ein Mittel: "Neu aufbauen". Das verwirft den
ganzen Index, liest den gesamten Baum neu und läuft entsprechend lange.
Niemand macht das freiwillig alle drei Monate, und wer es doch tut,
bezahlt dafür mit einer Zeit, in der Import und Abgleich blockiert sind.
Das Archiv hat also eine Prüfsumme je Datei, aber keine Antwort auf die
Frage, wann sie das letzte Mal tatsächlich gegen die Bytes geprüft wurde.

Nutzen: Knipsa kann zusagen, dass jede Datei im Archiv innerhalb eines
bekannten Zeitfensters mindestens einmal wirklich nachgerechnet wurde —
und zwar ohne einen einzigen Handgriff und ohne dass der Nutzer merkt,
dass etwas läuft. Damit wird aus "die Prüfsummen stehen irgendwo" ein
belastbares Versprechen: Verfällt ein Original still, erfährt der Nutzer
es in Wochen statt in Jahren, also solange es noch eine gesunde Fassung
in der Sicherung gibt. Das ist derselbe Gedanke wie beim vorhandenen
Alarm, nur auf den Teil des Archivs angewendet, den der Abgleich
bewusst überspringt.

## Skizze

**Grundhaltung:** Lesen, rechnen, melden — nichts anfassen. Der Rundgang
schreibt nie in eine Datei im `original`-Baum und reparieren tut er
nichts. Er stellt nur fest und meldet, wie es der Abgleich auch tut.

**Was er tut.** Ein Hintergrundlauf nimmt sich immer die Dateien vor,
deren letzte echte Prüfung am längsten zurückliegt, liest sie ganz,
rechnet Import- und Bild-Prüfsumme neu und vergleicht sie mit der
Referenz aus der Gesehen-Liste. Weicht etwas ab, entsteht derselbe Alarm,
den der Abgleich schon kennt — kein neuer Meldungstyp, keine zweite
Alarm-Logik. Je Datei wird nur der Zeitpunkt der letzten Prüfung
vermerkt; das ist die einzige neue Angabe.

**Wie er sich benimmt.** Der Rundgang ist der Dienst mit der niedrigsten
Priorität im Haus:

- Er läuft in kleinen Häppchen mit einem Budget (eine Zahl an Dateien
  oder eine Dauer je Häppchen), bevorzugt nachts, und ist zwischen zwei
  Häppchen jederzeit abbrechbar.
- Er nutzt die vorhandene Sperre: Import, Abgleich und Neuaufbau haben
  immer Vorrang, der Rundgang tritt zurück und macht später weiter.
- Er merkt sich, wo er stand. Ein Neustart des Containers kostet
  höchstens das angefangene Häppchen, nicht den Fortschritt.
- Das Tempo ist einstellbar, mit einer Voreinstellung, die das Archiv
  in einem vernünftigen Fenster einmal durchläuft (Größenordnung
  Wochen, nicht Stunden). Lieber langsam und dauerhaft als schnell und
  im Weg.

**Was man davon sieht.** Im Bereich "Archiv" eine einzige, ehrliche
Zeile: wie viel des Archivs innerhalb des Fensters geprüft ist und
welche Datei am längsten ungeprüft ist, z.B. "geprüft: 98% der Dateien
in den letzten 90 Tagen — ältester ungeprüfter Stand: 12.07.2026".
Diese Zahl ist der eigentliche Wert der Idee: Sie macht die Zusage
überprüfbar, statt sie zu behaupten. Gefundene Abweichungen stehen bei
den Alarmen, nicht in einem eigenen Winkel.

**Vermisste Dateien bleiben Sache des Abgleichs.** Der Rundgang
beantwortet nur die Frage "stimmen die Bytes noch", nicht "ist die Datei
noch da" und auch nicht "stimmen die Metadaten noch". Trifft er auf eine
Datei, die nicht mehr existiert, überlässt er sie dem nächsten Abgleich
und geht weiter.

**Was bewusst nicht dazugehört.** Keine Reparatur und kein
Zurückschreiben aus der Sicherung — das verstößt gegen "bewahren vor
aufräumen" und gehört ohnehin nicht in eine App, die ausdrücklich keine
Backup-Lösung ist. Kein Vergleich gegen die NAS-Kopie (naheliegend, aber
eine eigene Idee mit eigenen Fragen). Keine Prüfung der abgeleiteten
Bäume `jpeg` und `vorschau` — die sind jederzeit neu erzeugbar und damit
nicht schützenswert.

**Offene Frage für die Umsetzung:** Ob der Rundgang strikt nach "am
längsten ungeprüft" vorgeht oder neu importierte Fotos im ersten Jahr
etwas häufiger anfasst. Dafür spricht, dass ein Kopierfehler beim Import
früh auffallen sollte; dagegen, dass eine zweite Regel die nachvollzieh­
bare Zusage "jede Datei innerhalb des Fensters" verwässert. Im Zweifel
die einfache Variante — eine Zusage, die man in einem Satz sagen kann,
ist mehr wert als eine optimale Reihenfolge.
