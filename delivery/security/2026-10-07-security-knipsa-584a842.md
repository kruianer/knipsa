---
type: security
repo: Knipsa
commit: 584a842
date: 2026-10-07
---

# Security: Knipsa (584a842)

Automatisch erstellt vom appbaua-Worker am 2026-10-07.

Prüfung abgeschlossen — ich habe nichts im Repo verändert. Hier der Bericht.

---

# Security-Check: knipsa

**Datum:** 2026-10-07
**Repo:** `kruianer/knipsa`, Branch `main` (Commit `584a842`)
**Umfang:** gesamtes Repo (27 Dateien), Git-Historie (3 Commits, alle Branches), GitHub-Repo-Metadaten
**Prüfer:** autonomer Security-Task (req-014)

> **Keine repo-spezifische Sicherheits-Vorgabe vorhanden.** `delivery/security.md` existiert nicht, und `CLAUDE.md` hat keinen Abschnitt `## Security`. Es gab also kein SOLL, gegen das ich das IST abgleichen konnte. Diese Prüfung erfolgte daher nach allgemeinen Sicherheits-Best-Practices. Alle Aussagen zu Erreichbarkeit, HTTPS-Pflicht, Zugriffskreis, Backup-Frequenz und Datenschutz-Anforderungen sind damit **Annahmen meinerseits, keine Abweichungen von einer Vorgabe** — siehe H3.

## Kurz-Zusammenfassung

Das Repo enthält **keinen Anwendungscode** — nur das appbaua-Gerüst, eine zweizeilige `README.md` und einen Code-Review-Bericht. Es gibt keine Abhängigkeits-Manifeste, keine Container- oder CI-Konfiguration, keine laufende Umgebung und keinen hinterlegten Infrastruktur-Zugang. Eine Prüfung der Anwendungssicherheit ist deshalb nicht möglich.

**Ich habe im Repo und in der gesamten Git-Historie keine Secrets, Passwörter, Tokens oder Schlüssel gefunden** — auch keine gelöschten. Die `remote.origin.url` enthält kein eingebettetes Token, und es ist kein Credential-Helper konfiguriert. Der aktuelle Datenstand ist sauber.

Das reale Risiko liegt nicht im Ist-Zustand, sondern in der Konstellation, in der dieses Repo den ersten Code erzeugen wird. Drei Faktoren treffen zusammen: Das Repo ist **öffentlich auf GitHub** (live verifiziert), es hat **keine `.gitignore`**, und der Worker **committet und pusht autonom und unbeaufsichtigt**. Ein einzelner unbeobachteter Lauf, der nach einem lokalen Testdurchlauf `git add -A` ausführt, veröffentlicht damit eine `.env` oder Testfotos unwiderruflich und weltweit lesbar — Git behält Blobs auch nach `rm`, und bei einem öffentlichen Repo ist ein Secret in der Sekunde des Push als kompromittiert zu behandeln, nicht erst nach Entdeckung. Dass knipsa ein **Foto-Manager** ist, verschärft das: Fotos sind mit EXIF-GPS, Zeitstempeln und Gesichtern personenbezogene Daten im Kern des Datenbestands.

Dieses Zeitfenster — vor dem ersten Code — ist der günstigste Moment, das zu schließen. Danach ist es nicht mehr reversibel.

**Bilanz:** 3 hohe, 3 mittlere, 2 niedrige Befunde. Keine Befunde zu Anwendungscode oder Infrastruktur (beides nicht vorhanden bzw. nicht zugänglich).

---

## Hohe Befunde

### H1 — Repo ist öffentlich im Internet, bei autonomem, unbeaufsichtigtem Push

**Schweregrad: hoch** · **live verifiziert**

Verifiziert auf zwei unabhängigen Wegen:

- GitHub-API: `"private": false`, `"visibility": "public"`, `"forks_count": 0`, erstellt `2026-10-04`, letzter Push `2026-10-06`
- Anonymer `git ls-remote` ohne jede Credential (`GIT_TERMINAL_PROMPT=0`, globale und System-Git-Config ausgeblendet) liefert `refs/heads/main` — der Lesezugriff ohne Authentifizierung funktioniert also tatsächlich.

Jeder im Internet kann das Repo lesen und klonen. Für ein reines Gerüst ist das folgenlos. Problematisch wird es durch die Kombination mit dem autonomen Lieferprozess: `capture-bug/SKILL.md:73` und `capture-requirement/SKILL.md:226-227` lassen den Worker ohne menschliche Zwischenkontrolle committen und pushen. Es gibt also niemanden, der vor dem Push prüft, was eingecheckt wurde. Bei einem öffentlichen Repo ist der Zeitraum zwischen versehentlichem Push und Entdeckung die gesamte Exposition — und GitHub-Inhalte werden von Dritten gespiegelt und indexiert, Forks und Caches überleben ein späteres `git push --force`.

Entlastend: der appbaua-Standard hält Secrets bewusst außerhalb des Repos. `setup-remote-access/SKILL.md:40-44` legt Cloudflare-Tunnel-Tokens nach `~/<app>-env/dev.env` bzw. `prod.env`, also ins Home-Verzeichnis des Hosts, nicht in den Projektbaum. Das ist die richtige Konvention. Sie schützt aber nur die Dateien, die der Standard selbst anlegt — nicht eine `.env`, die ein Framework-Scaffold oder ein Testlauf im Projektordner erzeugt.

**Empfehlung:** Entscheiden, ob `knipsa` öffentlich sein *soll*. Für einen selbst-gehosteten Dienst, der von Dritten aufgesetzt wird, ist öffentlich eine legitime und übliche Wahl — dann aber bewusst, dokumentiert in `delivery/security.md`, und zwingend mit H2 abgesichert. Wenn die Öffentlichkeit kein Zweck ist, ist Umstellen auf privat der wirksamste Einzelschritt und jetzt — ohne Forks, ohne externe Beiträge — praktisch kostenlos. Zusätzlich in beiden Fällen: GitHub **Secret Scanning mit Push Protection** aktivieren (für öffentliche Repos kostenlos; blockiert erkannte Tokens bereits beim Push, also bevor sie in der Historie landen) — das ist der einzige Schutz in dieser Kette, der ohne menschliche Aufmerksamkeit greift.

### H2 — Keine `.gitignore`, obwohl der erste Code noch nicht geschrieben ist

**Schweregrad: hoch** · **aus Config erschlossen** (Datei-Absenz lokal verifiziert; `git status --porcelain --ignored` zeigt nichts Ignoriertes)

Es gibt keine `.gitignore` im Repo. Für knipsa ist das kein Formfehler, sondern die fehlende technische Absicherung gegen H1. Drei projektspezifische Gründe:

1. Die Anwendung wird **Mediendateien** verwalten — Originalfotos, Thumbnails, Caches, EXIF-Indizes, eine lokale DB-Datei. Genau die Artefakte, die ein Repo irreversibel aufblähen und bei einem öffentlichen Repo private Fotos publizieren.
2. Ein **selbst-gehosteter** Dienst braucht Konfiguration mit Secrets: Session-Keys, DB-Zugangsdaten, ggf. API-Schlüssel.
3. Der Worker pusht **unbeaufsichtigt** (siehe H1).

Ich habe in der Historie geprüft: bisher ist nichts davon passiert. Es wurde noch nie eine Datei mit `env`, `secret`, `key`, `pem`, `credential`, `.p12` oder `.pfx` im Pfad committet, und es existiert kein Blob über 100 KB. Der Befund ist also rein präventiv — aber er ist genau deshalb jetzt zu beheben: `.gitignore` nach dem ersten Lauf anzulegen ist zu spät.

**Empfehlung:** `.gitignore` anlegen, **bevor** der erste Lauf Code erzeugt. Mindestens: `.env` und `.env.*` (mit Ausnahme einer `.env.example`), Abhängigkeitsordner, Build-Output, sowie die Medien-, Thumbnail-, Cache- und DB-Pfade der App. Die exakten Einträge ergeben sich aus dem Stack und damit aus `setup-stack`; entscheidend ist nicht die Vollständigkeit, sondern dass die Datei vor dem ersten Code existiert. Ergänzend eine `.env.example` mit leeren Werten als dokumentierte, sichere Vorlage.

### H3 — Keine Sicherheits-Vorgabe: `delivery/security.md` fehlt und ist nicht aus `CLAUDE.md` verlinkt

**Schweregrad: hoch** · **aus Config erschlossen**

`delivery/security.md` existiert nicht. Der Ordner `delivery/security/` ist als leerer Platzhalter vorhanden, `CLAUDE.md` hat keinen Abschnitt `## Security`. Der Skill benennt beides selbst als Fehlerzustand — `setup-security/SKILL.md:51-53`: „`delivery/security.md` wird NICHT automatisch vom Worker geladen — sie muss aus der CLAUDE.md referenziert sein, sonst ignoriert der Worker sie."

Die Folge ist nicht nur, dass dieser Bericht ohne Maßstab arbeiten musste. Ohne die Datei fallen fünf sicherheitsrelevante Grundentscheidungen — Erreichbarkeit (nur WLAN vs. von außen), HTTPS-Pflicht, Zugriffskreis und Login-Zwang, Backup-Erwartung, Datenschutz-Anforderungen — beim ersten Requirement implizit im unbeobachteten Lauf, statt dass sie entschieden werden. Bei einem Foto-Manager sind das genau die Entscheidungen, die man nicht dem Zufall überlassen will.

Hinzu kommt: der Skill `setup-auth` ist ausgerollt und definiert einen fertigen Anmelde-Standard (Geräte-Entsperrung per Passkey, Mandantentrennung, Einladung statt offener Selbstregistrierung). Er ist aber nicht aktiviert — es existiert kein Requirement in `delivery/requirements/ready/`. Ein Foto-Manager ohne jeden Zugangsschutz ist der Default, wenn das so bleibt.

**Empfehlung:** `setup-security` ausführen — der Skill legt Datei *und* Verlinkung gemeinsam an, deshalb den Abschnitt nicht manuell nachtragen. Dabei die Erreichbarkeit explizit festlegen (bei „von außen": HTTPS als Pflicht, was mit dem Cloudflare-Tunnel aus `setup-remote-access` ohnehin gegeben wäre) und den Zugriffskreis klären. Fällt die Antwort auf „auch andere Personen" oder „von außen erreichbar", direkt `setup-auth` nachziehen, damit der Login-Standard als Requirement vorliegt, bevor der erste Code ohne ihn entsteht.

---

## Mittlere Befunde

### M1 — Es existiert nur `main`; der Worker hätte keinen Branch außer dem prod-Branch

**Schweregrad: mittel** · **live verifiziert** (anonymer `git ls-remote` zeigt auf dem Remote ausschließlich `refs/heads/main`)

Lokal und auf dem Remote existiert genau ein Branch: `main`. Die Capture-Skills setzen durchweg einen Branch `dev` voraus (`capture-bug/SKILL.md:27`, `capture-requirement/SKILL.md:42-43` und `:220`), und `setup-devops/SKILL.md:35-38, 143-145` ordnet in seinem Standard-Setup `main` → **prod** zu, mit der harten Regel „The worker commits only to `dev`" und „never pushes to `main` directly". `CLAUDE.md:22` formuliert dasselbe als absolute Grenze: „NIEMALS autonom nach prod deployen."

Der einzige existierende Branch ist damit derjenige, auf den der Worker laut Konvention nie schreiben darf. Ein Requirement, das jetzt eingeht, führt entweder zu einem fehlgeschlagenen Sync oder zu einem Commit direkt auf `main` — also unter Umgehung des menschlichen Freigabe-Gates. Sicherheitsrelevant ist das, weil die Branch-Trennung in dieser Architektur der einzige Mechanismus ist, der das prod-Gate durchsetzt: `delivery/devops.md` fehlt ebenfalls, es ist also nirgends definiert, was prod überhaupt *ist* — die Regel in `CLAUDE.md:22` ist aktuell nicht durchsetzbar. Dieser Punkt überschneidet sich mit H2 des Code-Reviews vom 2026-10-06 und ist seitdem unverändert offen.

**Empfehlung:** `dev` von `main` abzweigen und pushen, bevor der erste Requirement- oder Bug-Lauf startet — der billigste Schritt mit der größten Wirkung. Danach `setup-devops`, damit die Branch→Umgebung-Zuordnung für den Worker lesbar vorliegt. Zusätzlich auf GitHub eine **Branch-Protection-Regel für `main`** einrichten (Direkt-Push verbieten, PR erzwingen) — das macht aus der schriftlichen Regel eine technisch erzwungene, die auch ein fehlgeleiteter autonomer Lauf nicht umgehen kann. Soll bewusst nur `main` genutzt werden, muss das in `delivery/security.md` und `delivery/devops.md` stehen, zusammen mit einem Ersatzmechanismus für das prod-Gate.

### M2 — Umgang mit personenbezogenen Foto-Daten ist nirgends geregelt

**Schweregrad: mittel** · **aus Code/Config erschlossen** (abgeleitet aus dem Projektzweck in `README.md`; kein Code vorhanden)

knipsa ist laut `README.md` ein „Self-hosted photo manager and viewer". Fotos sind kein neutraler Dateityp: EXIF enthält regelmäßig GPS-Koordinaten (Wohnadresse, Aufenthaltsorte), Aufnahmezeitpunkt und Gerätekennung; die Bildinhalte selbst sind biometrisch relevant, sobald Gesichter erkannt oder Personen verschlagwortet werden. Das sind personenbezogene Daten im Kern des Datenbestands, nicht am Rand — und bei einem Viewer kommt die Frage nach Freigabe-Links hinzu, bei denen GPS-Daten unbeabsichtigt mit nach außen gehen.

Weil `delivery/security.md` fehlt (H3), existiert zu keinem dieser Punkte eine Vorgabe: nicht zur EXIF-Behandlung beim Teilen, nicht zur Verschlüsselung im Ruhezustand, nicht zu Löschfristen, nicht dazu, ob Dritte Alben sehen dürfen. Der Worker wird das Datenmodell also ohne jede Leitlinie entwerfen. Ich kann hier keine Abweichung melden, sondern nur, dass der Maßstab fehlt, wo er am dringendsten gebraucht wird.

**Empfehlung:** Im `setup-security`-Dialog (H3) den Datenschutz-Teil nicht überspringen und mindestens drei Punkte festlegen: (a) ob beim Erzeugen von Freigabe-Links/öffentlichen Ansichten GPS- und Geräte-EXIF entfernt wird — sinnvoller Default: ja, mit Opt-out; (b) ob Originale verschlüsselt im Ruhezustand liegen müssen; (c) ob Gesichtserkennung/Personen-Verschlagwortung überhaupt gewünscht ist — ein bewusstes Nein ist hier die einfachste Risikoreduktion und gehört dann als Non-Goal in `delivery/vision.md`.

### M3 — Keine Backup-Erwartung und kein Backup-Mechanismus

**Schweregrad: mittel** · **aus Config erschlossen**

Ein Abgleich mit der Backup-Erwartung war nicht möglich, weil keine formuliert ist (H3). Faktisch existiert im Repo auch kein Mechanismus: keine Compose-Datei, kein Backup-Skript, kein Volume-Konzept, kein Cron-Eintrag, keine Restore-Dokumentation.

Für knipsa ist das inhaltlich gewichtiger als für die meisten Projekte: Fotos sind typischerweise **unersetzlich** — es gibt keine Quelle, aus der man sie nach einem Plattenausfall neu erzeugen könnte. Ein selbst-gehosteter Dienst auf einem einzelnen Mini-PC hat keine Redundanz, die das abfedert. Beim aktuellen Stand (keine Daten) ist nichts gefährdet; der Punkt ist, dass das Backup-Konzept vor dem ersten produktiven Foto stehen muss, nicht danach.

**Empfehlung:** Backup-Erwartung in `delivery/security.md` festhalten: Frequenz, Zielort (idealerweise off-site oder mindestens auf einem anderen physischen Datenträger), Aufbewahrungsdauer. Dazu zwei Punkte, die oft fehlen und ein Backup wertlos machen: ein **getesteter Restore** (ein nie wiederhergestelltes Backup ist eine Annahme, kein Backup) und die Frage, ob die Sicherung die Datenbank **konsistent** erfasst — bei einem Foto-Manager müssen Medien-Dateien und Metadaten-DB zum gleichen Stand passen, sonst zeigt der Restore Alben ohne Bilder.

---

## Niedrige Befunde

### N1 — Kein Dependency-Scanning eingerichtet

**Schweregrad: niedrig** · **aus Config erschlossen**

Ich habe nach `package.json`, `requirements*.txt`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `Gemfile`, `pom.xml` und Lockfiles gesucht — es existiert keines. Es gibt also **keine verwundbaren Abhängigkeiten**, aber auch keine Möglichkeit, welche zu prüfen, und keinen Mechanismus, der das künftig tut: kein `.github/` und damit kein `dependabot.yml`, keine CI-Pipeline, kein Audit-Schritt. Auch unsichere Default-Konfiguration konnte ich nicht prüfen — es gibt keine Config-Datei, kein `Dockerfile` und keine Compose-Datei im Repo.

**Empfehlung:** Beim Festlegen des Stacks (`setup-stack`) gleich mitnehmen: `dependabot.yml` für Security-Updates sowie einen Audit-Schritt (`npm audit`, `pip-audit` o. Ä.) im Test-Kommando, damit er bei jedem Worker-Lauf mitläuft. Beides ist zusammen mit dem ersten Manifest in Minuten erledigt und später eine Nachrüstung.

### N2 — Öffentliches Repo ohne LICENSE

**Schweregrad: niedrig** · **live verifiziert** (GitHub-API: `"license": null`)

Das Repo ist öffentlich (H1), hat aber keine Lizenzdatei. Ohne Lizenz gilt das volle Urheberrecht: niemand darf den Code rechtlich nutzen, forken oder deployen. Für selbst-gehostete Software, deren Zweck gerade das Aufsetzen durch Dritte ist, ist das ein Widerspruch zum Verbreitungsmodell — kein Sicherheitsrisiko im engeren Sinn, aber eine Konsequenz der öffentlichen Sichtbarkeit und deshalb hier verzeichnet. Deckt sich mit N6 des Code-Reviews vom 2026-10-06.

**Empfehlung:** Mit der Entscheidung aus H1 zusammen erledigen. Bleibt das Repo öffentlich, eine Lizenz wählen und als `LICENSE` ablegen. Wird es privat, erledigt sich der Punkt.

---

## Nicht prüfbar

Zu folgenden Bereichen konnte ich **keinen Befund erheben**. Das ist eine Abdeckungslücke dieses Checks, kein Entwarnungssignal:

- **Tatsächliche Erreichbarkeit der App** — es ist keine Umgebung deployt und kein Host dokumentiert (`delivery/devops.md` fehlt). Ob HTTPS erzwungen wird, ob ein Port am Router offen steht, ob ein Login vorgeschaltet ist: alles unbestimmt, weil es nichts gibt, das erreichbar wäre.
- **Infrastruktur und SSH** — es ist kein Zugang hinterlegt (kein Host, kein Benutzer, kein Schlüssel, keine Cloudflare-Access-Konfiguration). `setup-remote-access` ist ausgerollt, aber nicht ausgeführt. Eine Live-Prüfung des Servers war daher ausgeschlossen.
- **Branch-Protection und Secret-Scanning-Status auf GitHub** — beides erfordert Repo-Admin-Rechte an der API; mir stand nur anonymer Lesezugriff zur Verfügung. Die Empfehlungen in H1 und M1 sind deshalb als „einrichten bzw. prüfen" formuliert, nicht als bestätigte Lücke.
- **Anwendungssicherheit** — Authentifizierung, Autorisierung, Session-Handling, Upload-Validierung (bei einem Foto-Manager ein echtes Thema: Bild-Parser sind eine klassische Angriffsfläche), Pfad-Traversal beim Ausliefern von Medien, Rate-Limiting. Es existiert kein Code.

---

## Empfohlene Reihenfolge

Die ersten drei Schritte schließen das Zeitfenster, das sich mit dem ersten Code unwiderruflich schließt:

1. **H1** — Entscheiden: öffentlich oder privat. Dazu Secret Scanning mit Push Protection aktivieren.
2. **H2** — `.gitignore` anlegen, **bevor** der erste Lauf Code erzeugt.
3. **M1** — `dev` abzweigen und pushen; Branch-Protection auf `main`.
4. **H3** — `setup-security` ausführen (legt Datei und `## Security`-Verlinkung gemeinsam an); bei Bedarf `setup-auth` nachziehen. Dabei **M2** (EXIF/Datenschutz) und **M3** (Backup) im Dialog mitentscheiden.
5. **N1** — Dependabot und Audit-Schritt zusammen mit `setup-stack` einrichten.
6. **N2** — Lizenzfrage mit der Entscheidung aus Schritt 1 erledigen.

Die Voraussetzungen aus H1 des Code-Reviews vom 2026-10-06 (`delivery/stack.md`, `delivery/devops.md`, `delivery/vision.md` fehlen alle) sind weiterhin offen und bleiben die Grundlage für Schritt 3 und 5.
