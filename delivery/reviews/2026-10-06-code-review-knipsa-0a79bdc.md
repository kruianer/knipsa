---
type: code-review
repo: Knipsa
commit: 0a79bdc
date: 2026-10-06
---

# Code-Review: Knipsa (0a79bdc)

Automatisch erstellt vom appbaua-Worker am 2026-10-06.

Ich habe das Repo vollständig durchgesehen (26 Dateien, 2 Commits). Hier der Bericht.

---

# Code-Review: knipsa

**Datum:** 2026-10-06
**Branch:** `main` (Commit `0a79bdc`)
**Umfang:** gesamtes Repo — 26 Dateien, davon 11 Skill-Definitionen, `CLAUDE.md`, `README.md`, 13 `.gitkeep`-Platzhalter
**Reviewer:** autonomer Code-Review-Task

## Zusammenfassung

Das Repo enthält **keinen Anwendungscode**. Es besteht ausschließlich aus dem appbaua-Standard-Gerüst (Commit `0a79bdc`) und einer zweizeiligen `README.md` aus dem Initial-Commit. Eine Review von Implementierung, Tests, Abhängigkeiten oder Sicherheit des Produkts ist damit nicht möglich — es gibt nichts zu prüfen.

Was prüfbar ist, ist die **Konfiguration des autonomen Lieferprozesses**, und dort liegt das eigentliche Risiko: `CLAUDE.md` verweist auf drei Kontextdateien als bindend („Befolge sie exakt"), von denen **keine existiert**. Gleichzeitig existiert nur der Branch `main` — der in der Standard-DevOps-Konvention der prod-Branch ist, während alle Capture-Skills auf einem Branch `dev` arbeiten wollen. In dieser Kombination hat der Worker weder Regeln noch einen sicheren Branch, auf dem er arbeiten könnte. Das ist vor dem ersten Requirement zu beheben.

**Bilanz:** 2 hohe, 3 mittlere, 6 niedrige Befunde. Keine Befunde zu Anwendungscode (nicht vorhanden).

---

## Hohe Befunde

### H1 — Alle als bindend verlinkten Kontextdateien fehlen

`CLAUDE.md` verweist auf drei Dateien und bezeichnet zwei davon ausdrücklich als exakt zu befolgen:

| Verweis in `CLAUDE.md` | Datei | Status |
|---|---|---|
| Zeile 15 (Vision) | `delivery/vision.md` | fehlt |
| Zeile 21 (DevOps) | `delivery/devops.md` | fehlt |
| Zeile 27 (Tech Stack) | `delivery/stack.md` | fehlt |

Damit sind alle drei Links in `CLAUDE.md` toter Verweis. Konkrete Folgen für den nächtlichen Lauf:

- **Ohne `delivery/stack.md`** kennt der Worker kein Build-, Test- oder Lint-Kommando und keine Konventionen. Er wählt Sprache und Framework beim ersten Requirement frei — bei einem leeren Repo heißt das: der Stack von knipsa wird de facto durch einen unbeobachteten Lauf festgelegt, nicht durch eine Entscheidung.
- **Ohne `delivery/devops.md`** existiert keine Branch→Umgebung-Zuordnung, kein Deploy-Trigger und keine Promotion-Regel. Die Warnung in `CLAUDE.md:22` („NIEMALS autonom nach prod deployen") ist dann nicht durchsetzbar, weil nirgends definiert ist, was prod *ist*.
- **Ohne `delivery/vision.md`** fehlt der Tie-Breaker für Grauzonen, den `CLAUDE.md:13-14` dem Worker genau dafür zuweist.

**Empfehlung:** Vor dem ersten Requirement die Skills `setup-stack`, `setup-devops` und `setup-vision` durchlaufen — in dieser Reihenfolge, weil `setup-devops` auf einen bekannten Stack aufsetzt.

---

### H2 — Branch `dev` fehlt; `main` ist der prod-Branch

Das Repo hat genau einen Branch:

```
* main
  remotes/origin/HEAD -> origin/main
  remotes/origin/main
```

Die Capture-Skills setzen dagegen durchweg einen Branch `dev` voraus:

- `.claude/skills/capture-bug/SKILL.md:27` — „`git pull` on dev before anything else happens"
- `.claude/skills/capture-requirement/SKILL.md:42-43` — „Run `git pull` on dev BEFORE anything else happens. The worker commits to dev continuously"
- `.claude/skills/capture-requirement/SKILL.md:220` — Phase 6 zieht erneut „on dev"

Und `setup-devops` definiert in seinem Standard-Setup (`SKILL.md:35-38, 143-145`): Branch `dev` → dev-Umgebung, Branch `main` → **prod**, mit der harten Regel „The worker commits only to `dev`" und „never pushes to `main` directly".

Daraus ergibt sich ein echter Konflikt, kein theoretischer: Der einzige existierende Branch ist derjenige, auf den der Worker laut Konvention nie schreiben darf. Ein Requirement, das jetzt über `capture-requirement` eingeht, führt entweder zu einem fehlgeschlagenen Phase-0-Sync oder — schlimmer — zu einem Commit auf `main`, also auf prod, unter Umgehung des menschlichen Freigabe-Gates.

**Empfehlung:** `dev` von `main` abzweigen und pushen, bevor der erste Requirement- oder Bug-Lauf startet. Danach `setup-devops` ausführen, damit die Zuordnung schriftlich und für den Worker lesbar vorliegt. Falls stattdessen bewusst nur `main` genutzt werden soll, muss das in `delivery/devops.md` stehen — zusammen mit einem anderen Mechanismus für das prod-Gate, da die Branch-Trennung dann als Schutz wegfällt.

---

## Mittlere Befunde

### M2 — `CLAUDE.md` enthält unausgefüllte Platzhalter und Rollout-Meta-Text

`CLAUDE.md:1` trägt den Titel `# <Projektname>`, obwohl Name und Zweck des Projekts bekannt sind (`README.md`: „knipsa — Self-hosted photo manager and viewer"). `CLAUDE.md:3-7` ist Meta-Text der Umstellung selbst („Diese Datei wurde von der appbaua-Umstellung (req-012) angelegt … passe sie an und ersetze die Platzhalter") und gehört nicht in die dauerhafte Projektanweisung.

Außerdem ist die Areas-Liste leer (`CLAUDE.md:44-45`). Das ist für den Startzustand korrekt und von `capture-requirement` Phase 1 abgedeckt (der Skill schlägt bei fehlender Area eine neue vor), aber in Kombination mit dem Platzhalter-Titel liest sich die Datei für den Worker als „noch nicht in Betrieb".

**Empfehlung:** Titel auf `# knipsa` setzen, Zweck aus der README in einen Satz überführen, Zeilen 3-7 löschen. Die Areas-Liste bleibt wie sie ist.

---

### M3 — Kein `.gitignore` — bei einem Foto-Manager mit autonomem Push konkret riskant

Es gibt keine `.gitignore` im Repo (`git status --porcelain --ignored` liefert nichts Ignoriertes). Für knipsa ist das kein Formfehler, sondern ein spezifisches Risiko, weil drei Faktoren zusammenkommen:

1. Die Anwendung verwaltet **Mediendateien** — Originalfotos, Thumbnails, Caches, EXIF-Indizes. Das sind genau die Artefakte, die versehentlich eingecheckt werden und ein Repo irreversibel aufblähen (Git speichert Blobs dauerhaft, auch nach `rm`).
2. Ein **selbst-gehosteter** Dienst braucht Konfiguration mit Secrets (`.env`, DB-Zugangsdaten, Session-Keys).
3. Der Worker **committet und pusht autonom und unbeaufsichtigt** (`capture-bug/SKILL.md:73`, `capture-requirement/SKILL.md:226-227`). Es gibt also keinen Menschen, der ein `git add .` vor dem Push prüft.

Ein einzelner unbeobachteter Lauf, der `git add -A` nach einem lokalen Testdurchlauf ausführt, kann damit Testfotos oder eine `.env` dauerhaft in die Historie schreiben.

**Empfehlung:** `.gitignore` anlegen, bevor der erste Lauf Code erzeugt — mindestens `.env*`, Abhängigkeitsordner, Build-Output, sowie Medien-/Thumbnail-/DB-Pfade. Die konkreten Einträge ergeben sich aus `setup-stack`; der Punkt ist, dass die Datei vor dem ersten Code existiert, nicht danach.

---

### M4 — `CLAUDE.md` fehlen die Abschnitte, die vier Setup-Skills zwingend voraussetzen

Vier Skills verlangen ausdrücklich einen eigenen Abschnitt in `CLAUDE.md`, weil ihre Ausgabedatei sonst vom Worker nicht gelesen wird:

| Skill | geforderter Abschnitt | Zieldatei | Abschnitt vorhanden? |
|---|---|---|---|
| `setup-security` (`SKILL.md:58`) | `## Security` | `delivery/security.md` | nein |
| `setup-health` (`SKILL.md:120`) | „Health" | `delivery/health.md` | nein |
| `setup-doc-site` (`SKILL.md:53`) | `## Doku-Site` | `delivery/doc-site.md` | nein |
| `setup-idea-direction` (`SKILL.md:53`) | (Ideen-Richtung) | `delivery/idea-direction.md` | im Abschnitt `## Ideen` vorhanden |

Die Skills formulieren das selbst als Fehlerzustand — `setup-security/SKILL.md:118`: „`delivery/security.md` unverlinkt aus der CLAUDE.md lassen — unverlinkt ignoriert der Worker sie." Aktuell sind Security-Task (req-014), Health-Übersicht (req-032) und Doku-Task (req-016) also ohne Einstiegspunkt, obwohl die zugehörigen Skills ausgerollt sind. Positiv: der Ideen-Task ist korrekt verdrahtet (`CLAUDE.md:34-35`).

**Empfehlung:** Kein manuelles Nachtragen der Abschnitte — die drei Skills legen Datei *und* Verlinkung gemeinsam an. Also `setup-security`, `setup-health` und `setup-doc-site` ausführen, wenn die jeweilige Funktion gebraucht wird. Bis dahin ist der Zustand konsistent-leer und nicht kaputt; er ist nur nicht einsatzbereit.

---

## Niedrige Befunde

### N1 — `delivery/design/design 1.0/` weicht vom Pfadschema der Skills ab und enthält ein Leerzeichen

Das Rollout hat `delivery/design/design 1.0/.gitkeep` angelegt. `capture-requirement` referenziert Mockups aber eine Ebene höher — `SKILL.md:130-131` („GUI as in `delivery/design/<file>`") und das Template in `SKILL.md:256` („`Mockup: delivery/design/<file>`"). Kein Skill kennt die Unterordner-Konvention `design <version>/`.

Zwei Folgen: Erstens landen Handover-Dateien je nach Lauf in `delivery/design/` oder in `delivery/design/design 1.0/`, und der im Requirement notierte Pfad trifft dann nicht zu. Zweitens bricht das Leerzeichen jede unquotierte Shell-Verwendung des Pfades.

**Empfehlung:** Entweder den Ordner auf `delivery/design/v1.0/` umbenennen *und* die Versionierungs-Konvention in `CLAUDE.md` dokumentieren, oder ihn entfernen und Mockups flach in `delivery/design/` ablegen — passend zu dem, was die Skills ohnehin erwarten. Letzteres ist der kleinere Eingriff.

### N2 — `delivery/doc-design/` fehlt

`setup-doc-site/SKILL.md:33` nennt `delivery/doc-design/` als Ort der Design-Vorlage und stellt fest: „Ohne diese Vorlage tut der Doku-Task nichts." Der Ordner existiert nicht. Nicht blockierend, solange M4 offen ist — der Skill legt ihn beim Lauf mit an.

### N3 — Drei Verzeichnisse sind in keiner Datei dokumentiert

`delivery/reviews/`, `delivery/security/` und `site/user-docs/assets/screenshots/` existieren als leere Platzhalter. Eine Suche über alle Skills und `CLAUDE.md` findet **keinen** Verweis auf `delivery/reviews/` oder `delivery/security/`; `site/user-docs/` wird nur beiläufig in `setup-doc-site/SKILL.md:95` erwähnt. Für `delivery/reviews/` ist die Zweckbestimmung aus dem Namen erschließbar (hier landet dieser Bericht), für `delivery/security/` — neben der geplanten Datei `delivery/security.md` — nicht.

**Empfehlung:** In `CLAUDE.md` einen kurzen Abschnitt zur Ordnerstruktur ergänzen, der die Ausgabeorte der Worker-Tasks benennt. Ein ungenutzter, unerklärter Ordner wird sonst beim nächsten Aufräumen gelöscht oder falsch befüllt.

### N4 — Sprachmix über die Skill-Definitionen

`CLAUDE.md` ist deutsch. Die Skills sind gemischt: `capture-bug`, `capture-requirement`, `setup-devops`, `setup-stack`, `setup-vision` sind englisch; `setup-auth`, `setup-doc-site`, `setup-health`, `setup-idea-direction`, `setup-remote-access`, `setup-security` sind deutsch. Die deutschen verwenden zudem ASCII-Transliteration in den Descriptions („Oeffnen", „Geraete", „aendern", „prueft"), während `CLAUDE.md` korrekte Umlaute nutzt.

Funktional harmlos — beide Capture-Skills regeln die Ausgabesprache explizit über die Sprache des Nutzers (`capture-bug/SKILL.md:18-21`, `capture-requirement/SKILL.md:19-25`). Es ist ein Konsistenz-, kein Verhaltensproblem, und betrifft den geteilten appbaua-Standard, nicht nur dieses Repo.

### N5 — `capture-requirement` nennt konkrete Modellnamen

`capture-requirement/SKILL.md:36-38` prüft, ob die Session auf einem der stärksten Modelle läuft, und nennt dafür „currently e.g. Fable 5 or Opus". Solche Aufzählungen veralten mit jeder Modellgeneration und führen dann zu falschen Warnungen. Das „currently e.g." federt das ab; eine Formulierung ohne Namensliste wäre wartungsfrei. Ebenfalls ein Standard-übergreifender Punkt.

### N6 — `README.md` ohne Inhalt, keine LICENSE

Die `README.md` besteht aus zwei Zeilen (Titel + eine Zeile Beschreibung). Keine Installations-, Betriebs- oder Konfigurationshinweise — was beim aktuellen Stand korrekt ist, da es nichts zu installieren gibt. Für einen selbst-gehosteten Dienst, der typischerweise von Dritten aufgesetzt wird, ist sie mitzuentwickeln, sobald Code entsteht. Eine `LICENSE`-Datei fehlt ebenfalls; bei self-hosted Software ist die Lizenzfrage für Nutzer relevant.

---

## Nicht prüfbar

Mangels Anwendungscode konnte zu folgenden Punkten **kein** Befund erhoben werden — das ist eine Lücke in der Abdeckung dieser Review, kein Entwarnungssignal:

- Korrektheit, Fehlerbehandlung, Datenmodell
- Tests und Testabdeckung (kein Test-Framework, kein Testkommando — siehe H1)
- Abhängigkeiten und deren Schwachstellen (keine Manifest-Datei vorhanden)
- CI/CD (kein `.github/workflows/`, keine Pipeline-Definition)
- Sicherheit der Anwendung: Authentifizierung, Zugriffskontrolle, Umgang mit Foto-Metadaten (EXIF-GPS ist bei einem Foto-Manager ein echtes Datenschutz-Thema) — dafür fehlt sowohl Code als auch die Soll-Vorgabe `delivery/security.md`

---

## Empfohlene Reihenfolge

1. **H2** — Branch `dev` anlegen und pushen. Billigster Schritt, entschärft das prod-Risiko sofort.
2. **H1** — `setup-stack`, dann `setup-devops`, dann `setup-vision`.
3. **M3** — `.gitignore` anlegen, passend zum in Schritt 2 festgelegten Stack, **bevor** der erste Lauf Code erzeugt.
4. **M2** — `CLAUDE.md` entplatzhaltern.
5. **N1** — Design-Ordner auf ein Schema bringen.
6. **M4** — `setup-security` und `setup-health` bei Bedarf; `setup-doc-site` erst, wenn Doku ansteht.
7. **N3/N6** — Ordnerstruktur dokumentieren, README und LICENSE mit dem ersten Code nachziehen.

Die Punkte **N4** und **N5** betreffen den geteilten appbaua-Standard und sollten dort behoben werden, nicht in diesem Repo.
