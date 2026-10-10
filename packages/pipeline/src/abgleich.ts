/**
 * Der Abgleich: er vergleicht den Foto-Baum mit dem Index.
 *
 * Der Baum ist die Wahrheit, der Index sein Abbild. Der Abgleich liest
 * deshalb nur — er legt im Baum nichts an, benennt nichts um und
 * veraendert keine Datei (einzige Ausnahme: neue Eintraege in der
 * Gesehen-Liste, die der Abgleich braucht, um die Bild-Pruefsumme eines
 * Fotos dauerhaft zu merken).
 *
 * Eine Datei, die seit dem letzten Lauf dieselbe Groesse und dieselbe
 * Aenderungszeit hat, wird nicht erneut gelesen. Dadurch kostet ein Lauf
 * ueber einen unveraenderten Baum nur je Datei ein `stat`.
 *
 * Welche Fotos es gibt, sagen Baum und Gesehen-Liste zusammen: ein
 * Schluessel aus der Gesehen-Liste ohne Datei im Baum gilt als vermisst
 * und bleibt im Index, bis die Datei wieder auftaucht.
 */

import { readdir, stat } from 'node:fs/promises';
import { join, posix } from 'node:path';

import {
  aufnahmezeitText,
  dateiArt,
  grundname,
  istFoto,
  originalVerzeichnis,
  pruefsumme,
  zerlegeSchluessel,
  type DateiArt,
} from '@knipsa/shared';

import { GesehenListe } from './gesehen.js';
import {
  type AbgleichLauf,
  type ArchivIndex,
  type ArchivStand,
  type IndexAlarm,
  type IndexDatei,
  type IndexFoto,
} from './archivindex.js';
import { KEINE_ANGABEN, type AngabenLeser, type GeleseneAngaben } from './metadaten.js';

/** Eine Datei, wie sie im Baum liegt. */
export interface BaumDatei {
  /** Pfad ab `original`, mit `/` als Trenner. */
  readonly pfad: string;
  readonly vollPfad: string;
  readonly art: DateiArt;
  readonly groesse: number;
  /** Aenderungszeit in Millisekunden seit 1970. */
  readonly geaendert: number;
}

/**
 * Reihenfolge der fuehrenden Datei eines Fotos: eine NEF fuehrt vor HEIC
 * und JPEG. Varianten gehoeren zu req-008 und kommen hier nicht vor.
 */
const RANG: Record<string, number> = { raw: 0, heic: 1, jpeg: 2 };

/**
 * Liest den Baum `original` samt Wartebereich. Versteckte Namen (mit
 * Punkt am Anfang, zum Beispiel `.import-teil`) bleiben aussen vor: sie
 * gehoeren zur Technik, nicht zum Archiv.
 */
export async function sammleBaum(wurzel: string, ordner = ''): Promise<BaumDatei[]> {
  const basis = originalVerzeichnis(wurzel);

  let eintraege;
  try {
    eintraege = await readdir(join(basis, ordner), { withFileTypes: true });
  } catch {
    // Kein `original`-Baum: dann ist das Archiv eben leer.
    return [];
  }

  const dateien: BaumDatei[] = [];
  for (const eintrag of [...eintraege].sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (eintrag.name.startsWith('.')) {
      continue;
    }

    const pfad = posix.join(ordner, eintrag.name);
    if (eintrag.isDirectory()) {
      dateien.push(...(await sammleBaum(wurzel, pfad)));
      continue;
    }
    if (!eintrag.isFile()) {
      continue;
    }

    const angaben = await stat(join(basis, pfad));
    dateien.push({
      pfad,
      vollPfad: join(basis, pfad),
      art: dateiArt(eintrag.name),
      groesse: angaben.size,
      geaendert: angaben.mtimeMs,
    });
  }

  return dateien;
}

/** Alle Dateien eines Fotos, gefunden im Baum. */
interface Einheit {
  readonly schluessel: string;
  /** Fotos (NEF, JPEG, HEIC), die fuehrende Datei zuerst. */
  readonly fotos: readonly BaumDatei[];
  readonly sidecars: readonly BaumDatei[];
}

/**
 * Ordnet die Dateien des Baums ihren Schluesseln zu. Eine Datei ohne
 * gueltigen Schluessel im Namen gehoert zu keinem Foto und wird als
 * unbekannte Datei gemeldet.
 */
export function ordneEinheiten(dateien: readonly BaumDatei[]): {
  einheiten: Einheit[];
  unbekannte: string[];
} {
  const nachSchluessel = new Map<string, BaumDatei[]>();
  const unbekannte: string[] = [];

  for (const datei of dateien) {
    const name = grundname(datei.pfad.split('/').at(-1) ?? '');
    if (zerlegeSchluessel(name) === undefined) {
      unbekannte.push(datei.pfad);
      continue;
    }

    const bisher = nachSchluessel.get(name) ?? [];
    bisher.push(datei);
    nachSchluessel.set(name, bisher);
  }

  const einheiten = [...nachSchluessel.entries()]
    .map(([schluessel, gefunden]) => ({
      schluessel,
      fotos: gefunden
        .filter((datei) => istFoto(datei.art))
        .sort((a, b) => (RANG[a.art] ?? 9) - (RANG[b.art] ?? 9) || (a.pfad < b.pfad ? -1 : 1)),
      sidecars: gefunden.filter((datei) => datei.art === 'sidecar'),
    }))
    .sort((a, b) => (a.schluessel < b.schluessel ? -1 : 1));

  return { einheiten, unbekannte: unbekannte.sort() };
}

export interface AbgleichOptionen {
  /** Wurzel des Foto-Baums. */
  readonly wurzel: string;
  readonly index: ArchivIndex;
  readonly leser: AngabenLeser;
  /**
   * `true` fuer "Neu aufbauen": der Index wird verworfen und jede Datei
   * neu gelesen, auch die unveraenderte.
   */
  readonly neuAufbauen?: boolean;
  /** Uhr; in Tests festgehalten. */
  readonly jetzt?: () => Date;
}

/** `true`, wenn die Datei so schon im Index steht. */
function unveraendert(datei: BaumDatei, bekannt: IndexDatei | undefined): boolean {
  return (
    bekannt !== undefined &&
    bekannt.groesse === datei.groesse &&
    bekannt.geaendert === datei.geaendert
  );
}

/**
 * Fuehrt einen Abgleich aus und hinterlaesst den neuen Stand im Index.
 * Gibt zurueck, was der Lauf gekostet und gefunden hat.
 */
export async function fuehreAbgleichAus({
  wurzel,
  index,
  leser,
  neuAufbauen = false,
  jetzt = () => new Date(),
}: AbgleichOptionen): Promise<AbgleichLauf> {
  const begonnen = jetzt();

  if (neuAufbauen) {
    await index.verwirf();
  }
  const alt = await index.lade();
  const bekannteDateien = new Map(alt.dateien.map((datei) => [datei.pfad, datei]));
  const bekannteFotos = new Map(alt.fotos.map((foto) => [foto.schluessel, foto]));

  const gesehen = await GesehenListe.lade(wurzel);
  const { einheiten, unbekannte } = ordneEinheiten(await sammleBaum(wurzel));

  const fotos: IndexFoto[] = [];
  const dateien: IndexDatei[] = [];
  const alarme: IndexAlarm[] = [];

  for (const einheit of einheiten) {
    const fuehrend = einheit.fotos[0];
    const sidecar = einheit.sidecars[0];

    for (const datei of [...einheit.fotos, ...einheit.sidecars]) {
      // Der Sidecar ist ein Feld der NEF, keine eigene Zeile im Archiv —
      // als Datei steht er trotzdem im Index, mit Groesse und Zeit.
      const gehoerenderSidecar = datei.art === 'raw' ? sidecar?.pfad : undefined;
      const bekannt = bekannteDateien.get(datei.pfad);

      dateien.push(
        unveraendert(datei, bekannt) && bekannt !== undefined
          ? { ...bekannt, schluessel: einheit.schluessel, sidecar: gehoerenderSidecar }
          : {
              pfad: datei.pfad,
              schluessel: einheit.schluessel,
              groesse: datei.groesse,
              geaendert: datei.geaendert,
              importPruefsumme: await pruefsumme(datei.vollPfad),
              bildPruefsumme: undefined,
              sidecar: gehoerenderSidecar,
            },
      );
    }

    // Die Angaben eines Fotos haengen an seiner fuehrenden Datei und
    // deren Sidecar. Nur wenn sich daran etwas geaendert hat, wird neu
    // gelesen — eine unveraenderte Datei liest Knipsa nicht zweimal.
    const bekanntesFoto = bekannteFotos.get(einheit.schluessel);
    const frisch =
      bekanntesFoto === undefined ||
      bekanntesFoto.vermisst ||
      (fuehrend !== undefined && !unveraendert(fuehrend, bekannteDateien.get(fuehrend.pfad))) ||
      (sidecar !== undefined && !unveraendert(sidecar, bekannteDateien.get(sidecar.pfad)));

    if (!frisch && bekanntesFoto !== undefined) {
      fotos.push(bekanntesFoto);
      continue;
    }

    fotos.push({
      schluessel: einheit.schluessel,
      aufnahmezeit: aufnahmezeitZu(einheit.schluessel),
      vermisst: false,
      ...(await leseAngaben(leser, fuehrend, sidecar)),
    });
  }

  // Vermisst ist jeder Schluessel aus der Gesehen-Liste, zu dem keine
  // Datei mehr im Baum liegt. Das Foto bleibt im Index: es ist einmal
  // importiert worden, und genau das soll zu sehen sein.
  const gefunden = new Set(einheiten.map((einheit) => einheit.schluessel));
  for (const schluessel of gesehen.alleSchluessel()) {
    if (gefunden.has(schluessel)) {
      continue;
    }

    const bekannt = bekannteFotos.get(schluessel);
    fotos.push(
      bekannt === undefined
        ? {
            schluessel,
            aufnahmezeit: aufnahmezeitZu(schluessel),
            vermisst: true,
            ...KEINE_ANGABEN,
          }
        : { ...bekannt, vermisst: true },
    );
  }

  const beendet = jetzt();
  const lauf: AbgleichLauf = {
    art: neuAufbauen ? 'neuaufbau' : 'abgleich',
    begonnen: begonnen.toISOString(),
    beendet: beendet.toISOString(),
    dauerMs: beendet.getTime() - begonnen.getTime(),
    fotos: fotos.length,
    dateien: dateien.length,
    vermisst: fotos.filter((foto) => foto.vermisst).length,
    alarme: alarme.length,
    unbekannte: unbekannte.length,
  };

  const stand: ArchivStand = { fotos, dateien, alarme, unbekannte, letzter: lauf };
  await index.speichere(stand);

  return lauf;
}

/** Aufnahmezeit aus dem Schluessel — sie steckt in ihm und aendert sich nie. */
function aufnahmezeitZu(schluessel: string): string {
  const zerlegt = zerlegeSchluessel(schluessel);
  return zerlegt === undefined ? '' : aufnahmezeitText(zerlegt.sekundenTeil);
}

/**
 * Liest die Angaben eines Fotos. Bei einer NEF gelten die Angaben aus
 * ihrem XMP-Sidecar; ohne Sidecar die aus der NEF selbst.
 */
async function leseAngaben(
  leser: AngabenLeser,
  fuehrend: BaumDatei | undefined,
  sidecar: BaumDatei | undefined,
): Promise<GeleseneAngaben> {
  if (fuehrend === undefined) {
    return KEINE_ANGABEN;
  }

  const quelle = fuehrend.art === 'raw' && sidecar !== undefined ? sidecar : fuehrend;
  return leser.leseAngaben(quelle.vollPfad);
}
