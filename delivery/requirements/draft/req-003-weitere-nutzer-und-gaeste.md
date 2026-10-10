---
id: req-003
app: knipsa
area: Zugang
created: 2026-10-10
---

> **Status draft:** Weitere Nutzer und Gäste widersprechen derzeit dem
> Non-Goal "keine Mehrbenutzer-Funktionen" in `delivery/vision.md`. Erst
> nach `ready/` verschieben, wenn die Vision angepasst ist.

# Goal (Why)

Baut auf req-002 (Anmeldung und Zugang) auf. Der Betreiber soll einzelne
Personen einladen und Gästen befristet einen Ausschnitt zeigen können,
z.B. einen Anlass mit der Familie teilen — ohne dass diese ein Konto
einrichten müssen. Knipsa folgt dabei dem gemeinsamen Anmelde-Standard
aller Apps.

# Function (What)

**Zugangsarten**

| | Anmeldung | Dauer | Sieht |
|---|---|---|---|
| Betreiber | Passkey | dauerhaft | alles, verwaltet Nutzer und Gäste |
| Mitglied | Passkey | dauerhaft | alles außer Verwaltung |
| Gast | Link/QR, kein Passkey | begrenzt | nur ausdrücklich freigegebene Anlässe |

**Einladungen**
- Der Betreiber lädt per E-Mail-Adresse ein; die Adresse bleibt am
  Konto. Die Einladung ist 7 Tage gültig, einmalig, nur als Hash
  gespeichert, und erlaubt dem Eingeladenen, seinen ersten Passkey zu
  registrieren. Versand über denselben SMTP-Weg wie in req-002.
- Ein Gast kann durch Einladung zum Mitglied hochgestuft werden.

**Gastzugänge**
- Der Betreiber legt Zweck, Dauer (Vorgabe 7 Tage, mindestens 1 Stunde,
  höchstens 90 Tage, nie unbegrenzt) und Umfang fest. Umfang: ein oder
  mehrere Anlässe, nur lesend (Ansehen und Blättern, keine Bewertung,
  keine Stichwörter, kein Cockpit, keine Ausleihe).
- Der Link trägt ein Geheimnis mit mindestens 128 Bit Zufall, nur als
  Hash gespeichert, als Text UND QR-Code gezeigt — nur unmittelbar nach
  dem Erstellen.
- Jederzeit widerrufbar; ein Widerruf wirkt sofort, auch für eine
  laufende Gast-Sitzung. Die Gast-Sitzung ist an den Link gebunden und
  endet spätestens mit ihm.
- Bilder und API liefern einem Gast ausschließlich Fotos der
  freigegebenen Anlässe; die Prüfung erfolgt serverseitig je Anfrage.

**Oberfläche**
- "Nutzer" (nur Betreiber): Nutzer des Mandanten mit Name, E-Mail,
  Rolle, Beitritt, letzter Anmeldung; "Einladen"; offene Einladungen mit
  Ablaufdatum und "Zurückziehen"; Nutzer entfernen. Der letzte Betreiber
  eines Mandanten kann nicht entfernt oder herabgestuft werden.
- "Gastzugänge" (nur Betreiber): Liste mit Zweck, Ablauf, letzter
  Verwendung, Status; "Gastzugang erstellen"; je Eintrag "Widerrufen".
- Was ein Nutzer nicht darf, wird ihm nicht angezeigt; die Prüfung auf
  dem Server gilt trotzdem. Ein Gast sieht keinen dieser Bereiche.

**Technisch (in diesem Stack)**
- Neue Tabellen per Kysely-Migration: `einladung` (Hash, mandant,
  E-Mail, rolle, läuft ab, verbraucht), `gastzugang` (Hash, mandant,
  Zweck, Umfang, läuft ab, widerrufen, zuletzt verwendet),
  Gast-Sitzungen mit Verweis auf `gastzugang`.
- Die Einlöse-Route für Gastlinks und Einladungen kommt auf die
  Allowlist des Fastify-Hooks aus req-002; alles andere bleibt geschützt.

# Acceptance Criteria

- [ ] Given ich bin Betreiber, when ich unter "Nutzer" jemanden per
  E-Mail einlade, then bekommt diese Person einen Link und kann damit
  einen eigenen Passkey registrieren; die offene Einladung ist mir mit
  Ablaufdatum angezeigt und lässt sich zurücknehmen.
- [ ] Given ich bin Mitglied und nicht Betreiber, when ich die App
  benutze, then sehe ich "Nutzer" und "Gastzugänge" nicht — und ein
  direkter Aufruf ihrer Adressen wird abgelehnt.
- [ ] Given ich bin Betreiber, when ich einen Gastzugang erstelle, then
  sehe ich den Link als Text und als QR-Code mit dem Hinweis, dass er nur
  jetzt sichtbar ist — und später finde ich ihn nirgends wieder.
- [ ] Given ein Gastlink für den Anlass "Ligurien im Juni", when der
  Gast ihn öffnet, then sieht er diesen Anlass ohne Passkey — und kein
  Foto, Bild oder API-Ergebnis darüber hinaus.
- [ ] Given ein abgelaufener oder widerrufener Gastlink, when er geöffnet
  wird, then wird der Zugriff abgelehnt; eine laufende Gast-Sitzung endet
  beim Widerruf sofort.
- [ ] Given ein Gast, when er bewerten oder Stichwörter ändern will, then
  ist das nicht möglich (weder in der Oberfläche noch über die API).
- [ ] Given ich bin der letzte Betreiber, when ich mich entfernen oder
  herabstufen will, then wird das abgelehnt.

# Constraints

- Setzt req-002 voraus.
- Feste Zeiten aus dem Anmelde-Standard: Einladung 7 Tage, Gastzugang
  Vorgabe 7 / höchstens 90 Tage.
- Geteilte Fotos verlassen dadurch das Haus — ist mit
  `delivery/security.md` (Zugriffskreis "nur der Betreiber") abzugleichen,
  bevor das Requirement auf `ready` geht.

# Out of Scope

- Passwort-Login, offene Registrierung.
- Feingliedrige Rechte über Betreiber, Mitglied und Gast hinaus.
- Freigabe einzelner Fotos statt ganzer Anlässe, Download für Gäste.
