---
type: code-review
repo: Knipsa
commit: ac196d0
date: 2026-10-13
---

# Code-Review: Knipsa (ac196d0)

Automatisch erstellt vom appbaua-Worker am 2026-10-13.

Review abgeschlossen — Lint und Typecheck sind grün, Tests habe ich paketweise laufen lassen, und zwei Befunde habe ich mit temporären Probe-Tests (danach entfernt, Arbeitsbaum ist wieder clean) nachgewiesen. Hier der Bericht.

---
type: code-review
repo: Knipsa
commit: ac196d0
date: 2026-10-13
---

# Code-Review: Knipsa (ac196d0)

**Datum:** 2026-10-13
**Branch:** `dev` (Commit `ac196d0`, 2026-10-10)
**Umfang:** gesamter Anwendungscode — `packages/shared`, `packages/pipeline`, `packages/server`, `packages/viewer`, `deploy/` und `.github/workflows/`; rund 14.500 Zeilen TypeScript, davon etwa die Hälfte Tests. Abgeglichen gegen `delivery/stack.md`, `delivery/vision.md`, `delivery/devops.md`, `delivery/security.md` und die Requirements req-001, req-005, req-006, req-007.
**Reviewer:** autonomer Code-Review-Task

## Vorgehen

Gelesen habe ich jede Quelldatei der vier Pakete sowie Compose, Dockerfile, Workflows und Health-Skript. Ausgeführt:

| Schritt | Ergebnis |
|---|---|
| `pnpm install --frozen-lockfile` | ok (Lockfile aktuell) |
| `pnpm lint` | **grün**, 0 Befunde |
| `pnpm typecheck` | **grün** in allen fünf Paketen |
| Tests, paketweise | shared 57/57, server 56/56, viewer 81/81, deploy 69/69, pipeline 167/195 |

Die 28 roten Tests liegen ausschließlich in `src/metadaten.test.ts` und `src/importlauf.test.ts` — beide brauchen ein echtes `exiftool`, und in dieser Review-Umgebung fehlt Perl (`which perl` leer). Das ist ein Umgebungsmangel, **keine Regression**: im Image bringt das Dockerfile Perl mit, und auf dem Beelink-Runner ist es Teil von Ubuntu. Mein Urteil über die Pipeline-Logik stützt sich daher auf Lesen und auf die 167 grünen Tests, nicht auf diese 28.

Zwei Befunde (H1, H2) habe ich mit eigenen Probe-Tests reproduziert und die Dateien danach gelöscht; ich habe nichts committet, nichts gepusht und keine Datei im Repo verändert.

## Zusammenfassung

Der Code ist in ungewöhnlich gutem Zustand. Die Trennung der Pakete folgt `delivery/stack.md` exakt, jede Datei trägt einen Kopfkommentar, der *warum* erklärt statt *was*; Domänenbegriffe stehen durchgehend deutsch wie im Glossar, Technik englisch. Kein `any`, kein `console.`, kein TODO, keine Secrets im Repo oder in der Historie. Die Kopieren-Prüfen-Übernehmen-Kette (`shared/archiv.ts` → `.import-teil` → `gesehen.jsonl` → `rename`) ist sorgfältig gebaut und durch Tests für Abbruch und Neustart abgesichert. Compose, Dockerfile und Workflows sind durch 69 eigene Tests gegen die Vorgaben aus `devops.md` und `security.md` festgenagelt — das ist stärker als in den meisten Repos.

Die Befunde liegen daher nicht in der Struktur, sondern an drei Rändern:

1. **Robustheit beim Lesen fremder Dateiformate.** Die Bild-Prüfsummen-Parser versprechen im Kommentar ausdrücklich, bei unlesbaren Dateien `undefined` zu liefern — tatsächlich werfen sie bei bestimmten Abbruchstellen. Eine einzige halbe JPEG- oder HEIC-Datei im Baum bringt damit **jeden** Abgleich zu Fall, stündlich neu, und der Index friert still ein (H1, M1).
2. **Der Viewer zeichnet im Takt alles neu.** Alles, was der Nutzer gerade tippt oder aufgeklappt hat, verschwindet nach 3 Sekunden. "Schlüssel nachschlagen" aus req-007 ist dadurch praktisch unbenutzbar, die aufklappbaren Läufe aus req-005 klappen von selbst wieder zu (H2).
3. **Skalierung und Zugang** — der Abgleich wächst quadratisch mit der Dateizahl (M2), und der Bereich "Archiv" liefert seit req-007 GPS-Koordinaten und Beschreibungen über eine Route ohne jeden Zugangsschutz, womit der Übergangs-Freibrief in `security.md` nicht mehr trägt (M4).

**Bilanz:** 2 hohe, 4 mittlere, 5 niedrige Befunde.

---

## Hohe Befunde

### H1 — Ein halbes JPEG oder HEIC im Baum bringt jeden Abgleich zu Fall

`packages/shared/src/bilddaten.ts:62`, `:163` · `packages/pipeline/src/abgleich.ts:265`

Beide Parser dokumentieren ihren Vertrag ausdrücklich: „`undefined`, wenn die Datei kein lesbares JPEG ist" (`bilddaten.ts:36-37`) und „`undefined`, wenn die Datei nicht wie erwartet aufgebaut ist" (`:210-213`). `bildPruefsumme` baut darauf auf und fällt dann bewusst auf die ganze Datei zurück, „damit Knipsa im Zweifel eine Änderung zu viel statt eine zu wenig meldet" (`:250-255`). Dieser Rückfall greift aber nicht, weil beide Parser in Randfällen werfen statt `undefined` zu liefern:

- **JPEG** (`:46`, `:62`): Die Schleifenbedingung ist `stelle + 1 < inhalt.length` — sie sichert zwei lesbare Bytes für den Marker, aber nicht die zwei weiteren für das Längenfeld. Endet die Datei direkt hinter einem Marker, wirft `readUInt16BE(stelle + 2)` einen `RangeError`.
- **HEIC** (`:149-208`): `abschnitteAus` läuft die Elementliste des `iloc`-Kastens ohne jede Bereichsprüfung ab. `anzahl` und die Feldbreiten kommen ungeprüft aus der Datei; ist der Kasten abgeschnitten oder sind die Werte unplausibel, läuft `stelle` über das Pufferende hinaus und `readUInt16BE`/`readUInt32BE` werfen.

Nachgewiesen mit einem Probe-Test gegen `fuehreAbgleichAus` — eine `.jpg` aus vier Bytes (`ff d8 ff e1`) im Wartebereich genügt:

```
RangeError: The value of "offset" is out of range. It must be >= 0 and <= 2. Received 4
 ❯ jpegBilddaten  shared/src/bilddaten.ts:62
 ❯ bildPruefsumme shared/src/bilddaten.ts:262
 ❯ fuehreAbgleichAus pipeline/src/abgleich.ts:265
```

Dasselbe für ein HEIC mit abgeschnittenem `iloc` (`bilddaten.ts:163`). In beiden Fällen bricht der **ganze** Lauf ab, nicht die einzelne Datei: `fuehreAbgleichAus` fängt um `bildPruefsumme` (`:263-266`) nichts ab, erreicht `index.speichere(stand)` (`:364`) nie, und der Index behält den Stand von vorher. `ArchivDienst` hält den Server zwar am Leben (`archivdienst.ts:141-148`), aber der stündliche Takt scheitert ab dann jede Stunde identisch — Alarme, vermisste Fotos und neue Importe stehen still, bis jemand die Datei von Hand entfernt. Dass das Ganze nicht sichtbar wird, ist M1.

Auslöser ist immer eine beschädigte Datei — genau der Fall, für den Alarm und Abgleich überhaupt gebaut sind: ein abgebrochener NAS-Kopiervorgang, eine von Hand in `original` gelegte Datei, ein HEIF-Aufbau, den der Parser nicht kennt. Die Wahrscheinlichkeit pro Datei ist klein, die Wirkung bei Eintritt vollständig und dauerhaft.

**Empfehlung:** Beide Parser gegen das Pufferende absichern (JPEG: `stelle + 3 < inhalt.length` vor dem Längenfeld; HEIC: in `abschnitteAus` vor jedem Lesen `stelle + breite <= iloc.ende` prüfen und sonst `undefined`) **und** in `bildPruefsumme` zusätzlich ein `try`/`catch` um den Zerlegungsschritt legen, damit der zugesicherte Rückfall auch bei einem künftigen Parserfehler hält. Als Test genau die Abbruchstelle ergänzen, die `bilddaten.test.ts:46-48` noch nicht abdeckt: `jpeg().subarray(0, 6)` fällt heute korrekt durch, `subarray(0, 4)` wirft.

Nebenbei im selben Modul: `kaesten` (`:93-111`) behandelt `groesse === 1` (64-Bit-Kastengröße) als Abbruch statt als Größenangabe und lässt Kästen mit `groesse` 2–7 durch, bei denen `start` hinter `ende` liegt. Beides ist bei Fotodateien unrealistisch, gehört aber in denselben Handgriff.

---

### H2 — Der Viewer löscht im 3-Sekunden-Takt, was der Nutzer gerade tut

`packages/viewer/src/seite.ts:283-298` · `archivseite.ts:203`, `:293` · `importseite.ts:274`, `:376`

Die Abfrageschleife zeichnet beide Bereiche bei jedem Durchgang komplett neu (`replaceChildren`), im Leerlauf alle 3 Sekunden (`QUELLEN_TAKT_MS`), während eines Laufs jede Sekunde. `zeigeImport`/`zeigeArchiv` halten Meldung, offene Listen, Nachfrage und Ordnerwahl bewusst über die Durchgänge hinweg (`seite.ts:157-161`, `:205-209`) — zwei Dinge fehlen in dieser Aufzählung:

- **Das Eingabefeld für den Schlüssel.** `zeichneNachschlagen` erzeugt es jedes Mal neu und setzt `feld.value = auskunft?.schluessel ?? ''` (`archivseite.ts:203`). Was der Nutzer getippt hat, steht nicht im Zustand und ist nach dem nächsten Durchgang weg — samt Fokus. Ein Schlüssel wie `20190614-101500a` hat 16 Zeichen; wer ihn nicht in unter 3 Sekunden tippt, kommt nie zum Knopf. Auf dem iPhone schließt sich dabei zusätzlich die Tastatur, was genau die Klasse von Problemen ist, die bug-001 gerade behoben hat.
- **Aufgeklappte Läufe.** `zeichneLauf` erzeugt `<details>` ohne `open` (`importseite.ts:274`); ein aufgeklappter Lauf klappt nach dem nächsten Durchgang wieder zu. req-005 verlangt das Ergebnis „aufklappbar je Datei" — bedienbar ist es so nicht.

Mit einem Probe-Test gegen `fuehreArchivBereich` und `fuehreImportBereich` über genau einen Durchgang reproduziert: der getippte Wert ist danach `''` (erwartet `20190614-101500a`), `document.activeElement` ist nicht mehr das Feld, und `details.lauf.open` ist `false`.

Die vorhandenen Tests konnten das nicht finden, weil sie die Schleife mit `weiter: () => false` nach dem ersten Zeichnen beenden (`seite.test.ts:50-57`) — es gibt bisher keinen Test, der einen zweiten Durchgang überhaupt erlebt.

**Empfehlung:** Dieselbe Lösung wie bei `ordnerwahl` und `listen` anwenden — den getippten Text und die aufgeklappten Läufe als Bedienzustand in `fuehreBereiche` führen und beim Zeichnen mitgeben (`feld.value` daraus, `details.open` daraus). Dazu einen Test, der zwei Durchgänge laufen lässt und prüft, dass Eingabe, Fokus und Aufklappzustand stehen bleiben; der ist die eigentliche Absicherung, weil er jede künftige Neuzeichnung mitprüft. Kleiner Zusatz an derselben Stelle: ein `Enter` im Feld löst das Nachschlagen heute nicht aus, nur der Knopf.

---

## Mittlere Befunde

### M1 — Ein gescheiterter Abgleich ist auf der Seite nicht zu sehen

`packages/pipeline/src/archivdienst.ts:141-148` · `packages/server/src/app.ts:123-126`

Scheitert ein Abgleich, wird der Fehler gefangen und über `meldeFehler` ins Server-Log geschrieben — „Abgleich abgebrochen", ohne Pfad, korrekt nach `security.md`. Auf der Seite ändert sich dadurch **nichts**: `ArchivZustand` (`archivdienst.ts:28-31`) kennt kein Fehlerfeld, die Zahlen bleiben die alten, und „Letzter Abgleich: …" zeigt weiter den letzten *erfolgreichen* Lauf. Ein Nutzer, der „Abgleich jetzt" drückt, bekommt `202` und sieht anschließend einen unveränderten Stand — nicht unterscheidbar von „es hat sich nichts geändert".

Das steht gegen `vision.md` („Im Zweifel: bewahren vor aufräumen — nichts ändern, sondern melden") und gegen die Ideen-Richtung („Lieber früh warnen als still reparieren"). In Verbindung mit H1 ist es der Unterschied zwischen „ein Lauf ist schiefgegangen" und „der Index ist seit Wochen tot, und niemand weiß es".

**Empfehlung:** Letzten Fehler samt Zeitpunkt im `ArchivDienst` behalten, in `ArchivZustand` mitgeben und im Bereich „Archiv" als Meldung zeigen (der Platz dafür existiert schon: `archivseite.ts:245-250`). Der Text darf dabei nur sagen, *dass* und *wann* es scheiterte, nicht welche Datei — Pfade des Foto-Baums gehören nach `security.md` nicht in die Oberfläche und nicht ins Log.

### M2 — Der Abgleich wächst quadratisch mit der Zahl der Dateien

`packages/pipeline/src/abgleich.ts:275-278` (dazu `:285-289` mit `gesehen.ts:248-260`)

Je Einheit sucht der Abgleich seine führende Datei mit `dateien.find(...)` im **gesamten** bisher aufgebauten Array. Das ist O(Fotos × Dateien). Nachgemessen, nur dieses Muster, ohne Dateizugriffe:

| Dateien | Kosten nur für `find` |
|---|---|
| 10.000 | 0,4 s |
| 30.000 | 3,6 s |
| 100.000 | 53 s |

req-007 verlangt „Abgleich über 10.000 Dateien in Sekunden" — das ist erfüllt. Der Zielbestand ist aber ein Lebensarchiv; bei 100.000 Dateien wird aus dem „nur je Datei ein `stat`", das der Modulkopf verspricht (`:10-12`), eine knappe Minute reiner Array-Suche pro Lauf, stündlich.

Der Eintrag ist beim Einfügen bekannt — es genügt, sich den Index vor dem `push` zu merken (oder die Einträge der Einheit in einer lokalen `Map` nach Pfad zu halten) und auf das `find` zu verzichten.

Im selben Lauf steckt ein zweiter, einmaliger Kostenpunkt: `merkeBildPruefsumme` (`:285-289`) öffnet die Gesehen-Liste je Foto neu, schreibt eine Zeile und ruft `sync()` (`gesehen.ts:248-260`). Beim *ersten* Abgleich über einen großen Bestand ist das ein `fsync` pro Foto. Das Anhängen-und-Sichern ist für die Haltbarkeit der Liste richtig und soll bleiben — aber die Referenzen eines Laufs ließen sich sammeln und gebündelt anhängen, mit demselben Ergebnis und einem `fsync` statt 100.000.

**Empfehlung:** Das `find` durch den gemerkten Index ersetzen (kleiner Eingriff, kein Verhaltenswechsel) und einen Test ergänzen, der die Laufzeit über einen synthetischen Baum als obere Grenze festnagelt — sonst wandert dieselbe Suche beim nächsten Requirement wieder hinein. Das Bündeln der Bild-Prüfsummen ist der zweite, unabhängige Schritt.

### M3 — „kann formatiert werden" erscheint auch, wenn Dateien übersprungen wurden

`packages/pipeline/src/importlauf.ts:131-149`

`abschlussText` rät zum Formatieren, sobald ein Lauf über das ganze Medium ohne Abbruch und ohne Problemfall endet. **Übersprungene** Dateien gehen in diese Entscheidung nicht ein — und übersprungen wird unter anderem jedes Video (`GRUND_VIDEO`, `:58`, `:382-384`). Eine Kamerakarte mit `IMG_0001.MOV` neben den NEFs führt damit zu „Vollständig im Archiv — kann formatiert werden", obwohl das Video nur auf der Karte liegt und Knipsa es nie angefasst hat. Wer dem Satz folgt, verliert es.

Die Umsetzung ist dabei **wortgetreu zu req-006**: „Nach einem Lauf über das ganze Medium ohne Abbruch und ohne Problemfall zeigt das Ergebnis 'Vollständig im Archiv — kann formatiert werden'" (`req-006:38-41`), und req-005 zählt Videos ausdrücklich als „übersprungen", nicht als Problemfall. Der Code weicht also nicht ab — die Lücke sitzt in der Anforderung. Deshalb melde ich sie hier und ändere nichts: welche Formulierung gelten soll, entscheidet der Betreiber.

**Empfehlung:** Als Bug oder Folge-Requirement erfassen, mit zwei vertretbaren Auflösungen: entweder den Formatier-Hinweis unterdrücken, sobald `uebersprungen > 0`, oder ihn um den Vorbehalt ergänzen („… — 3 übersprungene Dateien bleiben auf dem Datenträger"). Die zweite Variante passt besser zu „bewahren vor aufräumen": sie nimmt die Auskunft nicht weg, sondern macht sie wahr.

### M4 — Der Bereich „Archiv" liefert GPS und Beschreibungen über eine Route ohne Zugangsschutz

`packages/server/src/archiv.ts:56-69` · `packages/pipeline/src/archivdienst.ts:212-243`

`GET /api/archiv/foto?schluessel=…` gibt `auskunftText` zurück, und darin stehen Stichwörter, Titel, Beschreibung und `GPS: <Breite>, <Länge>` (`archivdienst.ts:221-230`). Der Kopfkommentar von `archivseite.ts:8-9` hält fest, dass die Seite keine *Bilder* zeigt — das ist richtig, aber Koordinaten privater Aufnahmen sind nach `security.md` („private Fotos mit Personen, GPS-Orten und Zeitpunkten") genau die sensiblen Daten, um die es dort geht.

`security.md` verlangt: „Jede Route außer Login und statischer App-Hülle ist geschützt — auch Bilder, Vorschauen und die API." Dafür gibt es einen Übergangs-Freibrief, der aber an eine Bedingung geknüpft ist: „Übergang bis req-004: nur im Heim-WLAN per HTTP … **In dieser Phase zeigt die App keine Fotos und keine personenbezogenen Daten.**" Mit req-007 ist diese Bedingung nicht mehr erfüllt. Die Erreichbarkeit ist weiter auf `192.168.2.200` begrenzt (`docker-compose.yml`, durch `docker-compose.test.ts` abgesichert), und req-002 (Anmeldung) liegt noch in `draft/` — die Lücke ist also heute auf das Heimnetz beschränkt und der prod-Baum ist ein leerer Platzhalter. Sie wird in dem Moment ernst, in dem req-004 den Tunnel öffnet, bevor req-002 den Login bringt.

Dazu gehört ein zweiter Punkt derselben Wurzel: `POST /api/archiv/neu-aufbauen` und `POST /api/import/start` sind ohne Authentifizierung und ohne Herkunftsprüfung erreichbar. Im Heimnetz genügt dafür eine beliebige Webseite im Browser des Betreibers, die einen einfachen POST auf die LAN-Adresse schickt. Verworfen wird dabei nichts Wertvolles — der Index baut sich neu auf, und der Import liest nur — aber ein Fremder kann Läufe auslösen und den Beelink beschäftigen.

**Empfehlung:** req-002 **vor** req-004 umsetzen, damit der Tunnel nie auf eine ungeschützte API trifft; die Reihenfolge ist die eigentliche Maßnahme. Lässt sich das nicht einhalten, bis dahin entweder GPS und Beschreibung aus `auskunftText` herausnehmen (Schlüssel, Zeit, Zustand und Dateien reichen für den Zweck „Index prüfen") oder in `security.md` festhalten, dass der Übergangssatz nicht mehr gilt und was stattdessen gelten soll. Beim Login dann gleich den Herkunftsschutz für die POST-Routen mitnehmen.

---

## Niedrige Befunde

### N1 — Der Problemordner wird je Problemfall komplett neu gehasht
`packages/pipeline/src/problem.ts:54-77`, `:106-108`. `vorhandeneSummen` liest den Ordner und bildet die Prüfsumme **jeder** dort liegenden Datei — bei jedem einzelnen Problemfall. Der Kommentar nennt die Annahme selbst: „Der Ordner ist klein". Genau die bricht im Fall, der den Problemordner füllt: eine beschädigte Karte mit 500 unlesbaren Dateien führt zu ~125.000 vollen Datei-Hashes. Da die Dubletten-Erkennung über die Import-Prüfsumme läuft, die der Aufrufer schon kennt, ließe sich der Stand einmal je Lauf aufbauen und mitführen.

### N2 — `APP_ORIGIN` ist Pflicht, wird aber von keinem Produktionspfad gelesen
`packages/shared/src/konfiguration.ts:151`. Fehlt die Variable, startet der Server nicht (`pflichtText`), obwohl `konfig.appOrigin` ausschließlich in Tests vorkommt. Dasselbe gilt für `app.decorate('knipsaKonfiguration', …)` (`app.ts:59`, `:156-159`), dessen einziger Leser `app.test.ts:20` ist. Beides ist vermutlich Vorarbeit für req-004 — dann gehört ein Satz dazu, warum es jetzt schon Pflicht ist; andernfalls ist es toter Zustand, und `delivery/stack.md` verlangt, dass solcher verschwindet (vgl. Commit `c57aaf9`).

### N3 — `delivery/stack.md` nennt `pnpm e2e`, es gibt weder Skript noch Playwright
`delivery/stack.md`, Abschnitt „Commands" („E2E: `pnpm e2e` (Playwright, Viewer)"), gegen `package.json:9-15`. Der Befehl existiert nicht, Playwright ist keine Abhängigkeit, und kein Workflow ruft ihn. `deploy/tests/geruest.test.ts:40-44` prüft die Befehlsliste nur für `lint`, `format` und `typecheck` — die Lücke fällt deshalb nicht auf. Entweder den Platzhalter in `stack.md` als „noch nicht eingerichtet" kennzeichnen oder den Testfall auf die vollständige Liste erweitern, damit Doku und Repo nicht auseinanderlaufen. (Dass `services/embedding` noch fehlt, ist dagegen erkennbar Zukunft und kein Befund.)

### N4 — Verweise werden beim Einlesen stillschweigend übersehen
`packages/pipeline/src/importlauf.ts:212-231`, `ordnerbaum.ts:93-111`. `readdir(..., { withFileTypes: true })` liefert für einen Symlink weder `isFile()` noch `isDirectory()`. Eine Datei, die in der Quelle nur über einen Verweis erreichbar ist, erscheint damit weder in der Zählung noch im Ergebnis — auch nicht als „übersprungen" mit Grund. Bei Kameras und Karten praktisch irrelevant, bei einem eingehängten Ordner (`IMPORT_QUELLEN`) nicht ausgeschlossen. Dass Verzeichnis-Verweise ignoriert werden, ist dabei ein *Vorteil*: es macht Schleifen unmöglich. Wenn das so gewollt ist, gehört es als Satz in den Modulkopf; wenn nicht, wäre ein `uebersprungen`-Eintrag die zur Vision passende Antwort — melden statt schweigen.

### N5 — Die Abfrageschleife holt jede offene Liste alle 3 Sekunden neu
`packages/viewer/src/seite.ts:293-295`. Pro Durchgang wird für jede aufgeklappte Liste ein eigener Aufruf gemacht, hintereinander, zusätzlich zu `/api/archiv` und `/api/import`. Bei drei offenen Listen sind das fünf Anfragen alle 3 Sekunden, dauerhaft, und bei `LISTEN_GRENZE = 500` werden bis zu 2.500 `<li>` je Durchgang neu erzeugt. Für einen Einzelnutzer im LAN tragbar, aber es ist derselbe Mechanismus, der H2 verursacht — wer H2 behebt, sollte hier gleich prüfen, ob ein Durchgang ohne Änderung überhaupt neu zeichnen muss.

---

## Was gut ist

Nicht als Höflichkeit, sondern weil es beim nächsten Requirement erhalten bleiben sollte:

- **Die Schreibkette im Foto-Baum.** `shared/archiv.ts` erzwingt Kopieren → Prüfsumme → `rename` und bietet bewusst keine Operation an, die in `original` löscht oder überschreibt (`:1-11`); `verwerfeTeildatei` weist jeden Pfad außerhalb von `.import-teil` ab (`:89-95`). Der Aufräumpfad nach einem Abbruch (`teilaufraeumen.ts`) entscheidet anhand der *Prüfsumme*, nicht des Namens. Das ist genau die zentrale Schicht, die `stack.md` verlangt.
- **Die Gesehen-Liste** wird nur angehängt und nach jedem Schreiben gesichert (`gesehen.ts:248-260`), eine halbe letzte Zeile wird beim Laden übergangen (`:96-126`). Für den einen Datenbestand, der sich nicht neu aufbauen lässt, ist das die richtige Strenge.
- **Der Index wird immer ganz ersetzt, in einer Transaktion** und in Stücken von 500 Zeilen (`server/src/db/archivindex.ts:42-50`, `:145-227`) — es gibt keinen halben Index. Jede Abfrage filtert nach `mandant_id`, auch da, wo es heute nur einen Mandanten gibt.
- **Betriebsdateien sind getestet, nicht behauptet.** 69 Tests in `deploy/tests/` halten Compose, Dockerfile, Workflows und Health-Skript gegen `devops.md` und `security.md` fest — bis hin zu „bindet keinen Port an 0.0.0.0" und „enthält keine Werte aus den env-Dateien". Diese Tests werden spätestens bei req-004 ihren Wert zeigen.
- **Integrationstests gegen echtes PostgreSQL** via PGlite im Testprozess, mit denselben Kysely-Migrationen und optional gegen ein laufendes Postgres über `TEST_DATABASE_URL` (`server/src/test/datenbank.ts:1-10`) — genau wie in `stack.md` gefordert, ohne Container im Testlauf.

---

## Nicht geprüft

- **Laufende Umgebungen.** Ich habe weder dev noch prod auf dem Beelink angesehen; alle Aussagen über Betrieb stammen aus Compose, Dockerfile und Workflows.
- **Die 28 exiftool-abhängigen Tests** (siehe „Vorgehen") — ihre Zusicherungen über das Verhalten von `exiftool` bei echten NEF-, HEIC- und XMP-Dateien konnte ich nicht nachvollziehen.
- **Abhängigkeits-Schwachstellen.** Kein `audit` gelaufen; 227 Pakete, alle aus dem Lockfile mit bestätigter Supply-Chain-Prüfung.
- **Repo-Sichtbarkeit auf GitHub** (H1 des Security-Berichts vom 2026-10-07) — `gh` steht hier nicht zur Verfügung. Das gehört in den Security-Task, nicht hierher.
- **E2E-Verhalten im echten Browser.** H2 ist in `happy-dom` nachgewiesen; auf dem iPhone kommt der Verlust der Tastatur hinzu, den ich nur aus dem Fokusverlust ableite, nicht gemessen habe.

## Empfohlene Reihenfolge

1. **H1** — Parser absichern und `bildPruefsumme` zusätzlich einklammern. Kleiner Eingriff, verhindert einen stillen Totalausfall des Index.
2. **M1** — Fehler des letzten Abgleichs auf der Seite zeigen. Macht H1 und alles Ähnliche künftig sichtbar, statt es im Log zu lassen.
3. **H2** — Eingabe, Fokus und Aufklappzustand als Bedienzustand führen, mit einem Test über zwei Durchgänge. Erst danach sind „Schlüssel nachschlagen" (req-007) und die aufklappbaren Läufe (req-005) wirklich abnahmefähig.
4. **M3** — Als Bug oder Requirement erfassen und vom Betreiber entscheiden lassen; nichts am Code ändern, bevor die Formulierung feststeht.
5. **M2** — `find` durch den gemerkten Index ersetzen, Laufzeit-Test als Grenze. Vor dem ersten Lauf über den echten Baum.
6. **M4** — Reihenfolge req-002 vor req-004 festhalten; falls nicht einhaltbar, `security.md` nachziehen.
7. **N1–N5** — beim nächsten Berühren der jeweiligen Datei mitnehmen. N3 ist eine Zeile in `stack.md` oder ein Testfall und sollte nicht liegen bleiben, weil Doku-Drift sich sonst fortschreibt.
