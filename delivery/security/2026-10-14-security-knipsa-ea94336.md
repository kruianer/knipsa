---
type: security
repo: Knipsa
commit: ea94336
date: 2026-10-14
---

# Security: Knipsa (ea94336)

Automatisch erstellt vom appbaua-Worker am 2026-10-14.

Prüfung abgeschlossen — ich habe nichts im Repo verändert (die Reproduktion lief in `/tmp`, außerhalb des Repos). Hier der Bericht.

---

# Security-Check: knipsa

**Datum:** 2026-10-14
**Repo:** `kruianer/knipsa`, Branch `dev` (Commit `ea94336`)
**SOLL:** `delivery/security.md` (vorhanden, aus `CLAUDE.md` verlinkt), ergänzt um `delivery/devops.md` und `delivery/stack.md`
**Umfang:** Requirements, Code, Config, Git-Historie (52 Commits, alle Branches), 220 installierte Pakete, **live geprüfte dev-Umgebung** (`http://192.168.2.200:8098`), DNS/TLS der Ziel-Hostnamen, gezielte Port-Prüfung des Beelink
**Nicht geprüft:** kein SSH-Zugang hinterlegt (`~/.ssh` existiert nicht, kein `cloudflared`) — alles Host-Seitige (sshd-Konfiguration, Cloudflare Access, NAS, Backups, installierte udev-Regeln, Router) ist daher nur aus Config erschlossen.

## Kurz-Zusammenfassung

Die Erreichbarkeit stimmt mit der Vorgabe überein, und zwar nachgewiesen: Der dev-Port hängt tatsächlich nur an `192.168.2.200:8098` (von der Docker-Bridge `172.23.0.1:8098` kommt `ECONNREFUSED`), Postgres antwortet auf `5432` nicht, Ollama auf `11434` nicht, prod (`8099`) läuft derzeit gar nicht. Im Repo und in der gesamten Historie stehen keine Secrets — nur Variablennamen. Der Viewer lädt kein einziges Drittanbieter-Skript (im gebauten Bundle keine externe URL), Pfad-Traversal über die statischen Dateien schlägt fehl, es gibt keine CORS-Freigabe, `mandant_id` ist überall durchgezogen, und die Deploy-Workflows haben keinen `pull_request`-Trigger — der self-hosted Runner ist damit nicht aus Fork-PRs angreifbar. Von 220 installierten Paketen hat keines ein bekanntes Advisory.

Zwei Dinge sind trotzdem ernst. Erstens kann die **Bezeichnung eines fremden Datenträgers Befehle als root** auf dem Beelink ausführen: `deploy/host/automount/knipsa-automount` schiebt die unmaskierte `blkid`-Ausgabe durch `eval`, und `blkid -o export` schützt zwar `$` und Backtick, nicht aber das Semikolon. Eine Karte mit dem Label `knipsa;…` genügt — und das Einstecken fremder Karten ist genau der Zweck von req-006. Zweitens ist **jede Route ohne Anmeldung erreichbar** (live verifiziert), und mit req-007 liefert `GET /api/archiv/foto` inzwischen GPS-Koordinaten, Stichwörter, Titel und Beschreibung. Damit ist die Bedingung, unter der `delivery/security.md` den Klartext-HTTP-Übergang überhaupt erlaubt („In dieser Phase zeigt die App keine Fotos und keine personenbezogenen Daten"), vom Code nicht mehr gedeckt. Heute fließen keine echten Daten, weil beide Foto-Bäume leer sind — der Schutz ist also eine env-Variable, kein Mechanismus. Mit dem ersten echten Baum kippt das ohne jede Code-Änderung.

Dazu kommt: Das Repo ist weiterhin **öffentlich** und enthält mittlerweile die vollständige Hausaufstellung (LAN-IP, Ports, Host-Pfade, SSH-Tunnel-Hostname, Access-Policy, Notweg-Rezept). Und von der Backup-Erwartung ist nichts umgesetzt — insbesondere liegt die laut Glossar *nicht neu aufbaubare* Gesehen-Liste auf der lokalen Platte des Beelink, nicht auf dem NAS.

**Bilanz:** 2 hohe, 3 mittlere, 5 niedrige Befunde. Davon 4 live verifiziert.

---

## Hohe Befunde

### H1 — Fremder Datenträger kann Befehle als root ausführen (`eval` auf `blkid`-Ausgabe)

**Schweregrad: hoch** · **aus Code erschlossen, Mechanik lokal reproduziert** (nicht auf dem Beelink verifiziert — kein SSH-Zugang)

`deploy/host/automount/knipsa-automount:9` übernimmt Label, Typ und UUID so:

```sh
eval "$(blkid -o export "$DEV" | grep -E '^(LABEL|TYPE|UUID)=')"
```

Das Skript läuft laut `99-knipsa-automount.rules` über `udev RUN+=`, also **als root**, bei jedem eingesteckten Block-Gerät. Das Label stammt vom Datenträger und ist damit vollständig vom Angreifer kontrolliert.

Belegt auf zwei Wegen:

1. **Was `blkid` liefert:** In `misc-utils/blkid.c:336` (util-linux, aktueller Stand) maskiert der Export-Modus genau diese Zeichen: `safe_print(ctl, value, valsz, " \\\"'$`<>")` — Leerzeichen, Backslash, Anführungszeichen, `$`, Backtick, `<`, `>`. Steuerzeichen werden als `^J` o. Ä. entschärft. **Nicht maskiert werden `;`, `&`, `|`, `(`, `)`.** Kommando-Substitution ist also dicht, Kommando-*Trennung* nicht.
2. **Was `eval` daraus macht:** Ich habe die Zeile 1:1 nachgebaut und ihr die Ausgabe vorgesetzt, die util-linux für das Label `knipsa;id` erzeugt. Ergebnis: `id` wurde ausgeführt (`uid=1001(worker) …`), danach lief das Skript mit `LABEL='knipsa'` und Exit-Code 0 normal weiter — die Einhängung gelingt, der Vorgang sieht unauffällig aus, nichts landet im Log.

Die Nachbereinigung per `tr -c 'A-Za-z0-9 ._-'` (Zeile 11) greift erst *nach* dem `eval` und schützt nur den Pfad, nicht die Ausführung. Die Mount-Optionen `ro,noexec,nosuid,nodev` sind richtig gesetzt, helfen hier aber nicht: die Ausführung passiert im Skript, nicht auf dem Datenträger.

Angriffsszenario: Jemand gibt dem Betreiber eine SD-Karte oder einen Stick „mit Urlaubsfotos" — das ist der in `delivery/stack.md` als **Fremdquelle** definierte Normalfall. Mit dem Einstecken läuft fremder Code als root auf dem Rechner, auf dem das gesamte Foto-Archiv und beide Umgebungen liegen. Label-Länge ist knapp (ext4 16 Zeichen, exFAT 11), reicht aber bequem für `a;curl …|sh` oder einen Nachlader.

**Empfehlung:** `eval` ersetzen, nicht entschärfen. Jeden Wert einzeln und ohne Shell-Interpretation holen:

```sh
LABEL=$(blkid -o value -s LABEL "$DEV" 2>/dev/null || true)
TYPE=$(blkid  -o value -s TYPE  "$DEV" 2>/dev/null || true)
UUID=$(blkid  -o value -s UUID  "$DEV" 2>/dev/null || true)
```

Die Werte landen damit als reine Zeichenketten in den Variablen; die bestehende `tr`-Bereinigung bleibt als zweite Schranke für den Pfad. Zusätzlich das Label auf eine Länge begrenzen. Weil die Dateien bereits auf dem Beelink installiert sind (`/usr/local/sbin/`), ist nach der Korrektur die Neuinstallation nach `deploy/host/automount/README.md` nötig — ein Repo-Fix allein wirkt nicht. Ein Regressionstest ist hier gut möglich: Skript gegen eine `blkid`-Attrappe laufen lassen, die ein Label mit `;` liefert, und prüfen, dass nichts ausgeführt wird.

### H2 — Kein Zugangsschutz, und die Archiv-Auskunft liefert inzwischen personenbezogene Daten

**Schweregrad: hoch** · **live verifiziert** (dev-Umgebung, ohne jede Anmeldung)

Ohne Cookie, Header oder sonstigen Nachweis beantwortet die laufende dev-Umgebung:

| Anfrage | Antwort |
|---|---|
| `GET /` | 200, Viewer |
| `GET /api/umgebung` | 200 `{"umgebung":"dev"}` |
| `GET /api/archiv` | 200, Zahlen + letzter Abgleich |
| `GET /api/archiv/liste?art=vermisst` \| `art=alarme` | 200, Listen (bis 500 Zeilen) |
| `GET /api/archiv/foto?schluessel=…` | 404 (Index leer) — die Route ist offen |
| `GET /api/import` | 200, Quellen und Lauf-Historie samt Protokollpfaden |
| `GET /api/import/ordner?quelle=Test` | 200, Ordnerbaum der Quelle |
| `GET /health/ready` | 200 |

Im Code gibt es keinen einzigen Auth-Hook: eine Suche über `packages/` nach `passkey`, `webauthn`, `session`, `cookie`, `login` findet nur Treffer zu `mandant_id`. req-002 (Anmeldung) liegt unverändert in `delivery/requirements/draft/`.

Das ist für die Übergangsphase vorgesehen — aber `delivery/security.md:17-19` erlaubt den WLAN-Klartext-Betrieb nur unter einer Bedingung: „In dieser Phase zeigt die App keine Fotos und keine personenbezogenen Daten." Diese Bedingung hält der Code seit req-007 nicht mehr ein. `packages/pipeline/src/archivdienst.ts:auskunftText` baut die Auskunft aus `GPS: <Breite>, <Länge>`, `Stichwörter`, `Titel`, `Beschreibung` und `Aufnahmezeit` — genau die Datenarten, die `delivery/security.md:48-49` selbst als sensibel benennt. `GET /api/archiv/foto` gibt sie unauthentifiziert über Klartext-HTTP heraus, und `/api/archiv/liste` die Pfade ab `original` (Anlass-Ordnernamen).

Dass heute nichts abfließt, liegt allein an der Konfiguration: beide Bäume sind leer (`FOTOS_ROOT` = `knipsa-fotos/dev` bzw. `prod-platzhalter`, live bestätigt durch `/api/archiv` → `fotos: 0`). Sobald `FOTOS_ROOT` auf den NAS-Baum zeigt — der nächste geplante Schritt — liefert dieselbe offene Route Koordinaten echter Aufnahmeorte an jedes Gerät im WLAN, Gastgeräte eingeschlossen.

**Empfehlung:** Die Reihenfolge gegenüber dem bisherigen Plan umstellen: **req-002 (Anmeldung) vor der NAS-Einbindung** umsetzen, nicht parallel dazu — `setup-auth` liegt fertig vor, der Standard ist definiert. Bis dahin als Riegel, der nicht von Disziplin abhängt: die Route `/api/archiv/foto` sowie die GPS-, Titel- und Beschreibungsfelder in `auskunftText` hinter einen Schalter legen, der an die Umgebung bzw. an „Anmeldung vorhanden" gebunden ist, und mit einem Test festnageln, dass ohne Anmeldung keine Koordinate die API verlässt. Damit wird die Bedingung aus `security.md:17-19` technisch erzwungen statt zugesagt. Alternativ, wenn req-002 ohnehin unmittelbar ansteht: in `security.md` festhalten, dass bis zur Anmeldung kein echter Baum eingebunden wird — dann ist die Vorgabe wieder konsistent mit dem Code.

---

## Mittlere Befunde

### M1 — Öffentliches Repo mit vollständiger Infrastruktur-Beschreibung, bei autonomem Push

**Schweregrad: mittel** · **live verifiziert** (GitHub-API: `"private": false`, `"visibility": "public"`, `"license": null`, `forks_count: 0`)

Der Befund H1 des Vorgängerberichts vom 2026-10-07 ist unverändert offen — aber seine Grundlage hat sich geändert. Damals war das Repo ein leeres Gerüst; heute steht darin die Hausaufstellung im Detail, weltweit lesbar:

- LAN-IP und Ports des Beelink (`192.168.2.200:8098/8099`), bestätigt in `docker-compose.yml:32` und beiden Workflows
- Host-Pfade samt Ablage der Secrets (`/home/kruianer/knipsa-env/dev.env`, `prod.env`), Compose-Projektnamen, DB-Namen
- SSH-Tunnel-Hostname `ssh.cellarvoice.com` und die Access-Policy (nur die E-Mail des Betreibers, Einmal-Code, 24 h) — `delivery/devops.md`
- der Notweg als fertiges Rezept: Einträge in `nutzer`, `passkey`, `sitzung`, `mitgliedschaft` löschen → „Ersteinrichtung starten" erscheint wieder. Das ist, sobald req-002 steht, die Anleitung zur Übernahme des Zugangs für jeden, der DB-Zugriff erlangt.

Secrets sind dabei **nicht** betroffen: Ich habe alle 52 Commits über alle Branches geprüft — kein Treffer auf Dateinamen mit `env`, `secret`, `credential`, `.pem`, `.key`, `.p12`, `token` außer `deploy/example.env` (nur Variablennamen, keine Werte), kein Blob über 200 KB, kein eingebetteter Wert bei `POSTGRES_PASSWORD`, `CLOUDFLARE_TUNNEL_TOKEN` oder `DATABASE_URL`. Die Konvention „Werte nur auf dem Host" wird eingehalten. Kein Credential-Helper konfiguriert, `remote.origin.url` ohne Token.

Nicht „hoch", weil es derzeit keine von außen erreichbare Angriffsfläche gibt, auf die diese Informationen passen: kein Port am Router, der Tunnel ist noch nicht aufgebaut (siehe N2), SSH ist schlüssel-only hinter Access. Es ist Vorarbeit für einen Angreifer, kein offenes Tor. Mit req-004 und req-002 ändert sich das.

**Empfehlung:** Entscheiden, ob `knipsa` öffentlich sein *soll*. Jetzt — ohne Forks — ist das Umstellen auf privat praktisch kostenlos und der einzige Schritt, der auch die bereits gepushte Historie abdeckt (`git push --force` erreicht Mirrors und Caches nicht). Bleibt es öffentlich: die konkreten Werte aus `delivery/devops.md` durch Platzhalter ersetzen und die echten in eine nicht eingecheckte Datei auf dem Host verlagern, insbesondere LAN-IP, Host-Pfade, den SSH-Hostname und den Notweg. In beiden Fällen zusätzlich **Secret Scanning mit Push Protection** aktivieren (für öffentliche Repos kostenlos) — der einzige Schutz in dieser Kette, der ohne menschliche Aufmerksamkeit greift, solange der Worker unbeaufsichtigt pusht. Und die Sichtbarkeits-Entscheidung in `delivery/security.md` festhalten, damit dieser Punkt nicht bei jedem Check neu auftaucht.

### M2 — Von der Backup-Erwartung ist nichts umgesetzt; die Gesehen-Liste liegt ungesichert auf lokaler Platte

**Schweregrad: mittel** · **aus Config erschlossen** (NAS und Hyper Backup nicht prüfbar — kein SSH)

`delivery/security.md:36-44` erwartet: stündliche und tägliche Schnappschüsse durch das NAS, Hyper Backup auf externe Platte, außer Haus verschlüsselt, gesichert werden `original`, `jpeg`, Gesehen-Liste und ein **nächtlicher Datenbank-Dump**; Gesehen-Liste und Dump sollen „auf dem NAS, nicht nur auf dem Beelink" liegen; die Wiederherstellung muss ein- bis zweimal im Jahr gegen die Prüfsummen geprobt werden, und „das Cockpit mahnt eine fällige Probe an".

Im IST existiert kein Teil davon:

- **Kein DB-Dump.** Keine Cron-Einheit, kein Skript, kein Dump-Schritt in den Workflows. Die Datenbank liegt im Docker-Volume `db-daten` auf der lokalen Platte (`docker-compose.yml`), ohne Sicherung.
- **Kein NAS.** `FOTOS_ROOT` zeigt laut `delivery/devops.md` auf `/home/kruianer/knipsa-fotos/dev` bzw. `/prod-platzhalter`, also lokal; der NAS-Mountpunkt steht dort noch als `<TODO>`.
- **Keine Restore-Probe, keine Mahnung.** Das Cockpit ist noch nicht gebaut, es gibt keinen Prüfsummen-Abgleich für eine Probe.

Der Index ist unkritisch — er ist laut `delivery/vision.md` („Datei vor Datenbank") und `archivindex.ts` aus Baum und Gesehen-Liste neu aufbaubar. Der Punkt ist die **Gesehen-Liste**: Das Glossar in `delivery/stack.md` bezeichnet sie ausdrücklich als „nicht neu aufbaubar", und `deploy/docker-compose.yml` legt sie mit dem Import in den Foto-Baum — heute also auf eine einzelne lokale Platte ohne Sicherung. Fällt die aus, sind Schlüssel-Vergabe und frühere Dateinamen unwiederbringlich weg, auch wenn alle Fotos noch existieren.

Kein Datenverlust-Risiko *heute*, weil beide Bäume leer sind. Genau deshalb ist jetzt der günstige Moment.

**Empfehlung:** Vor dem ersten echten Import drei Dinge, in dieser Reihenfolge: (1) NAS einbinden und `FOTOS_ROOT` für prod darauf zeigen lassen, damit Gesehen-Liste und Baum überhaupt in den Sicherungsbereich fallen — das ist der Schritt, der die anderen trägt; (2) nächtlichen `pg_dump` als Compose- oder systemd-Timer-Einheit mit Zielort auf dem NAS, Aufbewahrung festgelegt; (3) **eine** Wiederherstellungs-Probe durchführen, bevor echte Daten dazukommen — ein nie wiederhergestelltes Backup ist eine Annahme. Für die Konsistenz zwischen Dump und Baum reicht hier die Entwarnung, dass der Index ohnehin neu aufbaubar ist; die Probe muss also nur Gesehen-Liste und Baum zusammen abdecken. Die Cockpit-Mahnung ist Teil eines späteren Requirements und bis dahin durch einen Kalendereintrag ersetzbar.

### M3 — Unauthentifizierte, zustandsändernde POST-Routen ohne Begrenzung

**Schweregrad: mittel** · **aus Code erschlossen** (bewusst nicht ausgelöst — ein Aufruf hätte die laufende dev-Umgebung verändert)

Vier Routen ändern Zustand und sind, wie alle anderen (H2), ohne Nachweis aufrufbar:

- `POST /api/archiv/neu-aufbauen` — verwirft den Index und liest den gesamten Baum neu ein (`archivdienst.ts:baueNeuAuf`)
- `POST /api/archiv/abgleich` — löst einen Vollabgleich aus
- `POST /api/import/start` — startet einen Import über eine Quelle, optional auf einen Ordner begrenzt
- `POST /api/import/abbrechen` — bricht den laufenden Import ab

Es ist kein Rate-Limit registriert (`@fastify/rate-limit` ist nicht in `packages/server/package.json`), und kein CSRF-Schutz — letzterer greift ohnehin erst mit Anmeldung, aber bis dahin genügt jedem Gerät im WLAN ein einzelner Aufruf.

Die `Sperre` (`packages/pipeline/src/sperre.ts`) verhindert Gleichzeitigkeit, nicht Wiederholung: wiederholte Aufrufe halten Import, Abgleich und Neuaufbau dauerhaft belegt (`409` für alles andere) und legen damit den normalen Betrieb still, während jeder Lauf `exiftool` über den gesamten Baum schickt. Ein Fehlgriff ist genauso wahrscheinlich wie Absicht — ein neugieriger Klick eines Gastgeräts auf der offenen Seite reicht. Der Schaden ist Last und Blockade, kein Datenverlust: der Index ist neu aufbaubar, der Import rührt Fremdquellen nur lesend an (`docker-compose.yml`, `:ro`).

**Empfehlung:** Mit H2 zusammen erledigen — mit Anmeldung entfällt der Großteil. Unabhängig davon `@fastify/rate-limit` registrieren und für die vier POST-Routen eng setzen (etwa wenige Aufrufe pro Minute); das ist ein Zusatz von wenigen Zeilen in `app.ts` und schützt auch nach req-002 gegen versehentliche Mehrfachauslösung. Gleichzeitig prüfen, ob `neu-aufbauen` überhaupt ohne ausdrückliche Bestätigung erreichbar sein muss.

---

## Niedrige Befunde

### N1 — Keine Sicherheits-Header; HSTS fehlt, obwohl die Vorgabe es verlangt

**Schweregrad: niedrig** · **live verifiziert** (Header aller Antworten der dev-Umgebung geprüft)

Die Antworten enthalten ausschließlich `cache-control`, `content-type`, `etag`, `last-modified`, `connection`, `keep-alive` — also keinen einzigen Sicherheits-Header: kein `Content-Security-Policy`, kein `X-Content-Type-Options: nosniff`, kein `Referrer-Policy`, kein `X-Frame-Options`/`frame-ancestors`, kein `Strict-Transport-Security`. `@fastify/helmet` ist nicht eingebunden.

HSTS verlangt `delivery/security.md:14-16` ausdrücklich („HSTS gesetzt"); im Klartext-Übergang ist es naturgemäß wirkungslos, muss aber mit req-004 dastehen. Die übrigen Header wiegen heute leicht, weil der Viewer kein Drittanbieter-Skript lädt (im gebauten Bundle keine externe URL, nur `/assets/index-*.js` und `.css`) und ich keine `innerHTML`-Nutzung außerhalb von Tests gefunden habe — mit MapLibre und Kartenkacheln von OSM/basemap.at wird eine CSP dagegen der Ort, an dem die Datenschutz-Zusage „keine Bild- oder Fotodaten an Dritte" technisch festgelegt wird. Nebenbei: `APP_ORIGIN` wird gelesen und validiert (`konfiguration.ts:151`), aber nirgends verwendet — es gibt derzeit also keine Stelle, die die offizielle Adresse durchsetzt.

**Empfehlung:** `@fastify/helmet` in `app.ts` registrieren, bevor der Tunnel kommt: `nosniff`, `Referrer-Policy: no-referrer`, `frame-ancestors 'none'` sofort; HSTS an die Umgebung gebunden (nur bei HTTPS); die CSP mit dem ersten Kartenbild schreiben und die erlaubten Kachel-Hosts dort explizit aufführen — dann ist die Zusage aus `security.md:51-53` nicht nur dokumentiert, sondern vom Browser erzwungen.

### N2 — Die Ziel-Hostnamen zeigen auf den Webhoster, mit nicht passendem Zertifikat

**Schweregrad: niedrig** · **live verifiziert** (DNS und TLS-Handshake)

`knipsa.kremmel.org` und `dev.knipsa.kremmel.org` lösen beide auf `85.13.131.16` auf — dieselbe Adresse wie `kremmel.org`, also der Webhoster. Der TLS-Handshake liefert dort ein Zertifikat für `*.kasserver.com` (Aussteller Sectigo), das die angefragten Namen nicht abdeckt: jeder Aufruf endet mit `ERR_TLS_CERT_ALTNAME_INVALID`.

Das bestätigt, dass der Cloudflare-Tunnel aus req-004 noch nicht existiert (req-004 liegt in `draft/`) — insoweit erwartet. Sicherheitsrelevant ist die Zwischenzeit: Die Adresse, die `delivery/security.md` als *die* HTTPS-Adresse der App benennt, antwortet heute von einem fremden Host mit einer Zertifikatswarnung. Wer sie in Erwartung von Knipsa aufruft, lernt, diese Warnung wegzuklicken — genau die Gewohnheit, auf die ein späterer Man-in-the-Middle angewiesen wäre.

**Empfehlung:** Bis req-004 umgesetzt ist, die beiden Namen im DNS nicht auf den Webhoster zeigen lassen (Wildcard-Eintrag für `kremmel.org` prüfen und die Subdomains gezielt leer setzen oder auf Cloudflare vorbereiten). Mit req-004 dann die vollständige Kette herstellen: Tunnel-Hostname, Cloudflare-Zertifikat, HSTS (N1), und erst danach die LAN-Ports entfernen, wie `delivery/devops.md` es vorsieht.

### N3 — Pfade aus dem Foto-Baum können im Log landen, entgegen der Zusage im Code

**Schweregrad: niedrig** · **aus Code erschlossen**

`packages/server/src/app.ts` protokolliert Fehler mit der Begründung „Nur Quelle und Meldung ins Log, nie ein Pfad aus dem Foto-Baum" bzw. an der Archiv-Stelle ohne weitere Filterung:

```ts
meldeFehler: (fehler) => { app.log.error({ fehler: fehler.message }, 'Abgleich abgebrochen'); }
```

`fehler.message` wird dabei unverändert übernommen. In `packages/pipeline/src/abgleich.ts:94` steht ein ungeschütztes `await stat(join(basis, pfad))` — `readdir` darüber ist in `try/catch` gefasst, dieses `stat` nicht. Verschwindet eine Datei zwischen Auflistung und `stat` (laufender Lightroom-Export, NAS-Aussetzer, parallel aufgeräumter Wartebereich), lautet die Meldung `ENOENT: no such file or directory, stat '/fotos/original/2026-08-14_hochzeit_mueller/DSC_1234.NEF'` und landet genau so im Container-Log. Dasselbe gilt für Fehler aus `exiftool-vendored`, das den Dateipfad in seine Meldungen aufnimmt.

Strenggenommen keine Verletzung von `security.md:57` — dort sind „Koordinaten, Beschreibungen oder Tokens" genannt, keine Pfade. Anlass-Ordnernamen tragen aber Namen und Orte („hochzeit_mueller"), und die Zusage im Code gilt nicht.

**Empfehlung:** Die Meldung vor dem Logging durch eine kleine Funktion in `packages/shared` schicken, die den Wert von `FOTOS_PFAD` und alles danach auf einen Platzhalter kürzt — ein Ort, an dem auch künftige Logaufrufe greifen. Zusätzlich das `stat` in `abgleich.ts:94` in `try/catch` fassen und die Datei bei einem Fehler überspringen; dann bricht ein Abgleich nicht mehr an einer verschwundenen Datei ab, was ohnehin das robustere Verhalten ist.

### N4 — Automatisches Einhängen fremder Dateisysteme als root

**Schweregrad: niedrig** · **aus Config erschlossen**

Die udev-Regel hängt jedes eingesteckte Gerät selbsttätig ein und akzeptiert dabei `vfat|exfat|ntfs|ntfs3|ext2|ext3|ext4|hfsplus`. Jeder dieser Treiber parst im Kernel-Kontext Strukturen, die vollständig von einem fremden Medium stammen; `ntfs3` und `hfsplus` haben hier die unerfreulichste Historie. Die Optionen `ro,noexec,nosuid,nodev` sind richtig gesetzt und schließen den Userspace-Teil des Risikos; das Kernel-Risiko bleibt und ist durch Mount-Optionen nicht adressierbar. Unabhängig von H1 — der Befund bleibt, auch wenn `eval` verschwindet.

**Empfehlung:** Die Liste auf das kürzen, was Kameras und Karten real liefern — `vfat` und `exfat`, bei Bedarf `ext4`; `ntfs3` und `hfsplus` streichen oder, wenn NTFS-Platten vorkommen, über `ntfs-3g` im Userspace einhängen, wo ein Treiberfehler nicht den Kernel trifft. Das ist eine Zeile in `knipsa-automount` und kostet nur Komfort bei exotischen Medien.

### N5 — Kein Dependency-Scanning und kein Audit-Schritt

**Schweregrad: niedrig** · **live verifiziert** (Advisory-Abfrage durchgeführt; Absenz der Konfiguration lokal geprüft)

Aktuell sauber: Ich habe die 220 installierten Pakete aus `node_modules/.pnpm` mit Version gegen die npm-Advisory-Schnittstelle (`/-/npm/v1/security/advisories/bulk`) abgefragt — **kein einziger Treffer**. Die Laufzeit-Abhängigkeiten sind aktuell (Fastify 5.12, `@fastify/static` 10.1, Kysely 0.29, `pg` 8.23, exiftool-vendored 39.0), Node ist auf 24 festgelegt, das Basis-Image `node:24-slim`, pnpm im Image auf `12.10.1` gepinnt, und `pnpm install --frozen-lockfile` verhindert stille Versionssprünge beim Deploy.

Es fehlt der Mechanismus, der das so hält: `.github/` enthält nur die beiden Deploy-Workflows, keine `dependabot.yml`; die Workflows führen Lint, Typecheck und Tests aus, aber keinen Audit-Schritt. Der Befund N1 des Vorgängerberichts ist damit unverändert offen — mit dem Unterschied, dass es jetzt Manifeste gibt, an denen ein Scanner ansetzen könnte. Eine neue Lücke in Fastify oder `pg` würde heute niemandem auffallen.

**Empfehlung:** `.github/dependabot.yml` für das pnpm-Workspace anlegen (wöchentlich, gruppierte Patch-Updates) und `pnpm audit --audit-level high` als Schritt in beide Deploy-Workflows aufnehmen, direkt nach dem Install. Weil der Worker ein Requirement erst bei grünem dev-Deploy abschließt, wird aus dem Audit damit automatisch ein Gate, ohne dass jemand daran denken muss.

---

## Nicht prüfbar

Keine Befunde, aber auch keine Entwarnung — es ist kein Infrastruktur-Zugang hinterlegt (`~/.ssh` existiert nicht, kein `cloudflared` vorhanden):

- **sshd-Konfiguration** (`PasswordAuthentication no`, `PermitRootLogin no`) und **Cloudflare Access** (E-Mail-Beschränkung, Einmal-Code, 24 h) — nur aus `delivery/devops.md` bekannt. Port 22 ist im WLAN offen, was für den Heimnetz-Zugang erwartbar ist.
- **Router:** Ob tatsächlich kein Port weitergeleitet wird, lässt sich von innen nicht feststellen. Aus dem LAN sieht alles vorgabenkonform aus.
- **NAS, Schnappschüsse, Hyper Backup, Verschlüsselung außer Haus** — siehe M2.
- **Ob die udev-Dateien auf dem Beelink dem Repo-Stand entsprechen** — relevant für H1: der Fix wirkt erst nach erneutem `install` nach `deploy/host/automount/README.md`.
- **Branch-Protection und Secret-Scanning-Status** — benötigt Admin-Rechte an der API; mir stand nur anonymer Lesezugriff zur Verfügung. `main` und `dev` existieren beide auf dem Remote.

Zwei Beobachtungen am Rand, ohne Befundcharakter: Die **prod-Umgebung läuft nicht** (`192.168.2.200:8099` → `ECONNREFUSED`) — erwartbar, weil nach `delivery/devops.md` nur ein Merge auf `main` sie startet. Und auf dem Beelink antworten im WLAN zwei **fremde Dienste**: Port 3000 eine andere Web-App, Port 8080 ein HTTPS-Dienst mit selbst ausgestelltem Zertifikat. Beide gehören nicht zu Knipsa (kein `/api/umgebung`, kein `/health/ready`) und liegen außerhalb dieses Checks; Knipsa selbst veröffentlicht nur `8098`, wie vorgegeben.

---

## Empfohlene Reihenfolge

1. **H1** — `eval` aus `knipsa-automount` entfernen und die Dateien auf dem Beelink neu installieren. Kleinster Eingriff, größte Wirkung, und bis dahin keine fremden Datenträger einstecken.
2. **H2** — req-002 (Anmeldung) vor die NAS-Einbindung ziehen; bis dahin GPS/Titel/Beschreibung in der Auskunft riegeln und mit einem Test festnageln. **M3** (Rate-Limit) fällt hier mit ab.
3. **M2** — NAS einbinden, nächtlichen Dump einrichten, eine Restore-Probe fahren — alles **vor** dem ersten echten Import, solange nichts zu verlieren ist.
4. **M1** — Sichtbarkeit des Repos entscheiden und Secret Scanning mit Push Protection aktivieren; bei „öffentlich" die konkreten Infrastruktur-Werte aus `delivery/devops.md` herausnehmen.
5. **N1/N2** — mit req-004 gemeinsam erledigen: Helmet samt HSTS und CSP, Tunnel aufbauen, DNS der Ziel-Hostnamen bereinigen, erst danach die LAN-Ports entfernen.
6. **N3, N4, N5** — Nebenarbeiten: Log-Pfade kürzen und das `stat` fassen, Dateisystem-Liste kürzen, Dependabot und Audit-Schritt nachziehen.
