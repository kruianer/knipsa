---
id: req-002
app: knipsa
area: Zugang
created: 2026-10-10
---

> **Status draft:** Passkeys brauchen HTTPS. Erst nach `ready/`
> verschieben, wenn req-004 (Externer Zugang) umgesetzt ist.

# Goal (Why)

Knipsa ist über `https://knipsa.kremmel.org` aus dem Internet erreichbar
und zeigt private Fotos mit Personen, Orten und Zeitpunkten — ohne
Zugangsschutz könnte sie jeder sehen, der die URL kennt. Knipsa folgt dem
gemeinsamen Anmelde-Standard aller Apps des Betreibers, damit ein Nutzer,
der eine App kennt, alle kennt.

Dieses Requirement macht die App für den Betreiber allein vollständig
nutzbar. Weitere Nutzer und Gastzugänge folgen in req-003 (derzeit
`draft`).

# Function (What)

**Anmelden**
- Beim Öffnen der App erscheint sofort die Geräte-Entsperrung (Face ID /
  Touch ID / Windows Hello) — ohne dass vorher ein Knopf gedrückt wird.
  Umgesetzt als Conditional UI (`mediation: "conditional"`, Anmeldefeld
  mit `autocomplete="username webauthn"`).
- `userVerification: "required"` und `residentKey: "required"`.
- Ein sichtbarer Anmeldeknopf bleibt als Rückfallweg für Browser ohne
  Conditional UI.
- "Anderes Gerät verwenden" nutzt die geräteübergreifende
  Passkey-Anmeldung des Browsers (QR-Code, Handy entsperrt per Face ID).
- Ein angemeldeter Nutzer kann weitere Geräte hinzufügen und sieht seine
  Geräte in einer Liste (Name, letzte Verwendung, entfernbar).

**Mandanten**
- Jeder Datensatz gehört zu genau einem Mandanten; jede Abfrage filtert
  danach. Der Mandant kommt aus der Sitzung, nie aus der Anfrage.
- Das gilt für alle Tabellen, auch die späteren Fachtabellen (`foto`,
  `datei`, `anlass`, …): Sie bekommen eine Spalte `mandant_id`. Der
  bestehende Foto-Baum gehört dem ersten Mandanten.
- Die Ersteinrichtung legt den ersten Mandanten an, der Betreiber ist
  Besitzer. Seine Adresse ist per Vorgabe `uwe@kremmel.org`
  (überschreibbar per `BOOTSTRAP_EMAIL`), damit der Wiederherstellungsweg
  ab der ersten Minute steht.
- Die Mandantenauswahl ist unsichtbar, solange ein Nutzer nur zu einem
  Mandanten gehört.

**Wer hineinkommt**
- Keine offene Selbstregistrierung. Außer der Ersteinrichtung entsteht in
  diesem Requirement kein Konto; Einladungen kommen mit req-003.
- Jedes Konto hat eine hinterlegte E-Mail-Adresse. Ein Konto ohne Adresse
  kann nicht entstehen.

**Wiederherstellung**
- "Zugang verloren": E-Mail-Link an die hinterlegte Adresse, 15 Minuten
  gültig, einmalig, nur als Hash gespeichert, berechtigt ausschließlich
  zur Registrierung eines neuen Passkeys (meldet nicht an). Der Link geht
  immer an die hinterlegte Adresse, nie an eine im Formular eingegebene.
  Antwort immer gleich ("Falls die Adresse bekannt ist, wurde ein Link
  verschickt"), unabhängig davon, ob die Adresse bekannt ist. Höchstens 3
  Anforderungen pro Stunde und Konto.
- Versand per SMTP über `w0089340.kasserver.com` (all-inkl), Port 587 mit
  STARTTLS (oder 465). Zugangsdaten aus `SMTP_HOST`, `SMTP_PORT`,
  `SMTP_USER`, `SMTP_PASSWORD`, Absender aus `MAIL_FROM` =
  `Knipsa <noreply@knipsa.kremmel.org>` — für beide Umgebungen gleich.
  Der Betreff nennt die Umgebung auf dev (z.B. `[dev] Knipsa – Zugang
  wiederherstellen`). Der Link trägt die Origin der Umgebung, aus der er
  angefordert wurde. Die Mail enthält nichts außer dem Link (keine
  Kontodaten, keine Geräteliste). Ein fehlgeschlagener Versand ändert die
  Antwort der App nicht — er gehört ins Log.

**Oberfläche**
- Anmeldeseite mit `autocomplete="username webauthn"`-Feld; darunter
  kleiner: Anmeldeknopf als Rückfallweg, "Anderes Gerät verwenden",
  "Zugang verloren". Solange kein Nutzer existiert, zusätzlich
  "Ersteinrichtung starten" — danach nie wieder.
- "Meine Geräte": eigene Passkeys mit Name, Hinzugefügt-am,
  Zuletzt-verwendet; "Dieses Gerät hinzufügen" und je Eintrag
  "Entfernen". Ein entferntes Gerät verliert sofort auch seine laufenden
  Sitzungen. Der letzte Passkey lässt sich nur entfernen, wenn eine
  E-Mail-Adresse hinterlegt ist. Unten "Überall abmelden", das alle
  Sitzungen beendet, auch die aktuelle (Passkeys bleiben bestehen), mit
  entsprechendem Hinweis.
- "Abmelden" an gewohnter Stelle der App (Menü/Kopfzeile); beendet nur
  die Sitzung dieses Geräts, nicht den Passkey.
- Die Bereiche "Nutzer" und "Gastzugänge" gibt es in diesem Requirement
  noch nicht (req-003).

**Feste Zeiten**
- Sitzung 7 Tage, verlängert sich bei Nutzung.
- Wiederherstellungs-Link 15 Minuten, WebAuthn-Challenge 5 Minuten,
  höchstens 3 Wiederherstellungs-Anforderungen pro Stunde und Konto.

**Technisch (in diesem Stack)**
- Server: Fastify in `packages/server`. Ein globaler `onRequest`-Hook
  prüft die Sitzung für jede Route; offen ist nur eine explizite
  Allowlist: Anmeldeseite und statische App-Hülle, Anmeldung,
  Ersteinrichtung, Wiederherstellung und deren API-Routen. Eine neue Route
  ist damit automatisch geschützt — ausdrücklich auch Bilder (großes
  JPEG, Vorschau) und jede API.
- WebAuthn mit `@simplewebauthn/server` und `@simplewebauthn/browser`;
  Mail mit `nodemailer`; Cookies mit `@fastify/cookie`.
- Sitzung im httpOnly-Cookie, `sameSite: lax`, `secure` außerhalb
  `localhost`. Im Cookie steht nur eine zufällige Sitzungs-ID; die
  Sitzung liegt in der Datenbank (als Hash), damit Entfernen und
  "Überall abmelden" sofort wirken.
- Ablage in PostgreSQL über Kysely-Migrationen, Tabellen (Namen nach
  Glossar-Konvention): `mandant`, `nutzer` (mit E-Mail),
  `mitgliedschaft` (nutzer ↔ mandant, rolle), `passkey` (Credential-ID,
  Public Key, Zähler, Name, hinzugefügt, zuletzt verwendet),
  `sitzung` (Hash, nutzer, passkey, mandant, läuft ab), `challenge`,
  `wiederherstellung` (Hash, nutzer, läuft ab, verbraucht).
- Viewer (`packages/viewer`, reines TypeScript): Anmeldeseite, "Meine
  Geräte", "Abmelden".
- Passkeys je Umgebung getrennt:
  - prod: Origin `https://knipsa.kremmel.org`, rpId `knipsa.kremmel.org`
  - dev: Origin `https://dev.knipsa.kremmel.org`, rpId
    `dev.knipsa.kremmel.org`
  - lokal: Origin `http://localhost:<port>`, rpId `localhost`
  Die Origin kommt aus `APP_ORIGIN` (aus req-001/req-004), die rpId ist deren
  Hostname; der Server prüft die Origin exakt.

# Acceptance Criteria

- [ ] Given ich bin auf diesem Gerät bekannt, when ich die App öffne,
  then erscheint die Geräte-Entsperrung (Face ID / Touch ID / Windows
  Hello) von selbst, ohne dass ich vorher einen Knopf drücke.
- [ ] Given mein Browser kann kein Conditional UI, when ich die App
  öffne, then sehe ich einen Anmeldeknopf, der zum selben Ziel führt.
- [ ] Given ich bin auf dem iPhone angemeldet, when ich die App auf dem
  Windows-PC öffne und dort einen Passkey hinzufüge, then kann ich mich
  auf beiden Geräten anmelden.
- [ ] Given ein Gerät ohne Passkey-Fähigkeit, when ich "Anderes Gerät
  verwenden" wähle und den QR-Code mit dem Handy scanne, then bin ich auf
  diesem Gerät angemeldet.
- [ ] Given eine frisch deployte Umgebung ohne Nutzer, when ich die App
  aufrufe, then sehe ich "Ersteinrichtung starten" und kann darüber ohne
  Kommandozeile einen Mandanten, den Betreiber mit hinterlegter Adresse
  (`uwe@kremmel.org`, sofern nicht per `BOOTSTRAP_EMAIL` anders gesetzt)
  und dessen ersten Passkey anlegen.
- [ ] Given es existiert bereits ein Nutzer, when ich die Anmeldeseite
  aufrufe, then ist "Ersteinrichtung starten" nicht mehr vorhanden —
  auch nicht über die direkte URL oder API-Route.
- [ ] Given ein frisch per Ersteinrichtung angelegter Betreiber, when er
  sofort einen Wiederherstellungs-Link anfordert, then kommt dieser an.
- [ ] Given ich bin nicht angemeldet, when ich eine geschützte Seite,
  eine API-Route oder ein Bild (großes JPEG, Vorschau) direkt aufrufe,
  then bekomme ich die Anmeldeseite bzw. 401 und NICHT den Inhalt.
- [ ] Given Daten eines anderen Mandanten, when ich dessen ID in der URL
  oder im Request angebe, then bekomme ich sie NICHT zu sehen.
- [ ] Given jemand ohne Konto, when er sich zu registrieren versucht,
  then wird das abgelehnt.
- [ ] Given ich habe genau einen Passkey und keine hinterlegte
  E-Mail-Adresse, when ich diesen Passkey entfernen will, then wird das
  abgelehnt.
- [ ] Given ich bin angemeldet, when ich "Abmelden" wähle, then ist die
  App gesperrt — und beim nächsten Öffnen komme ich per Face ID wieder
  hinein, ohne den Passkey neu einzurichten.
- [ ] Given ich bin auf dem iPad und auf dem Laptop angemeldet, when ich
  auf dem Laptop unter "Meine Geräte" das iPad entferne, then ist das
  iPad sofort abgemeldet und zeigt beim nächsten Aufruf die Anmeldeseite.
- [ ] Given ich bin auf mehreren Geräten angemeldet, when ich "Überall
  abmelden" wähle, then sind alle Geräte abgemeldet — auch das aktuelle —
  und meine Passkeys funktionieren weiterhin.
- [ ] Given ich war 7 Tage nicht in der App, when ich sie öffne, then
  muss ich mich neu entsperren; nutze ich sie regelmäßig, then bleibe ich
  angemeldet.
- [ ] Given ich habe mein Gerät verloren, when ich einen
  Wiederherstellungs-Link anfordere und öffne, then kann ich einen neuen
  Passkey registrieren — und der Link ist danach verbraucht.
- [ ] Given ein Wiederherstellungs-Link ist älter als 15 Minuten, when
  ich ihn öffne, then wird er abgelehnt.
- [ ] Given eine unbekannte E-Mail-Adresse oder ein fehlschlagender
  Mailversand, when ich einen Link anfordere, then unterscheidet sich die
  Antwort der App nicht von der bei einer bekannten Adresse.
- [ ] Given ich habe in dieser Stunde schon 3 Links angefordert, when ich
  einen vierten anfordere, then wird keine Mail verschickt (Antwort
  unverändert).
- [ ] Given ich fordere auf dev einen Link an, when die Mail ankommt,
  then zeigt der Link auf `https://dev.knipsa.kremmel.org` und der
  Betreff nennt die Umgebung.
- [ ] Given ich registriere einen Passkey auf
  `https://dev.knipsa.kremmel.org`, when ich mich auf
  `https://knipsa.kremmel.org` anmelden will, then gilt er dort NICHT
  (und umgekehrt).

# Constraints

- Setzt req-001 (Betriebsgerüst) und req-004 (Externer Zugang) voraus.
- WebAuthn funktioniert nur im "secure context": dev und prod brauchen
  gültiges TLS — das liefert der Cloudflare-Tunnel aus req-004.
  `localhost` gilt als sicher.
- Conditional UI setzt Discoverable Credentials voraus
  (`residentKey: "required"`).
- dev darf NICHT `knipsa.kremmel.org` als rpId verwenden (technisch
  erlaubt, weil Eltern-Domain) — sonst gälten prod-Passkeys auf dev.
- Die Wiederherstellung braucht `SMTP_USER` und `SMTP_PASSWORD` in
  `~/knipsa-env/dev.env` bzw. `~/knipsa-env/prod.env` auf dem Server —
  nie im Repo, nie in der Compose-Datei. Für den Absender
  `noreply@knipsa.kremmel.org` muss bei all-inkl Postfach bzw.
  Absender-Berechtigung und SPF für die Subdomain eingerichtet sein.
- Die Ersteinrichtung läuft über die Oberfläche und ist nur sichtbar,
  solange kein Nutzer existiert. Sie gehört unmittelbar nach dem Deploy
  gemacht: bis dahin könnte sie jeder auslösen, der die URL kennt.
- Offline (Etappe 5): Der Service Worker cached keine Antworten der
  Auth-Routen. Ist das Gerät offline und war die App zuletzt angemeldet,
  bleibt der lokale Bildspeicher ohne Server-Prüfung nutzbar. Nach
  "Abmelden" oder einer 401-Antwort sperrt sich die App auch offline.
- Tests: WebAuthn-Abläufe mit Testvektoren/virtuellem Authenticator
  (Playwright CDP), SMTP durch einen Stub; keine echten Mails in Tests.

# Out of Scope

- Passwort-Login, offene öffentliche Registrierung, Backup-Codes.
- Einladungen, weitere Nutzer, Gastzugänge, Bereiche "Nutzer" und
  "Gastzugänge" (→ req-003).
- Compose und Deploy-Workflow (→ req-001), Cloudflare-Tunnel (→ req-004).
- Maschinen-Zugang für Dienste (z.B. späterer Export-Wächter am PC).
- Löschen des lokalen Bildspeichers beim Abmelden.
