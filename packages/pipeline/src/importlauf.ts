/**
 * Ein Import-Lauf ueber eine Quelle.
 *
 * Die Quelle ist eine Fremdquelle: sie wird nur gelesen, niemals
 * geaendert. Jede Datei wird nach `.import-teil` kopiert, gegen ihre
 * Pruefsumme geprueft, erst dann in die Gesehen-Liste geschrieben und
 * zuletzt in den Wartebereich umbenannt — in dieser Reihenfolge, damit
 * ein Abbruch nie eine halbe Datei im Archiv hinterlaesst.
 */

import { readdir } from 'node:fs/promises';
import { join, posix } from 'node:path';

import {
  baueSchluessel,
  dateiArt,
  endung,
  grundname,
  istFoto,
  kopiereGeprueft,
  pruefsumme,
  sekundenTeil,
  teilVerzeichnis,
  uebernehmeTeil,
  wartendAnzeige,
  wartendPfad,
  type DateiArt,
  type QuellenEinstellung,
  type SekundenTeil,
} from '@knipsa/shared';

import { GesehenListe, type GesehenEintrag } from './gesehen.js';
import type { MetadatenLeser } from './metadaten.js';
import { schreibeProtokoll } from './protokoll.js';

/** Wie eine Datei im Ergebnis eines Laufs gezaehlt wird. */
export type ErgebnisArt = 'neu' | 'bekannt';

/** Eine Datei im Ergebnis eines Laufs. */
export interface ErgebnisEintrag {
  readonly art: ErgebnisArt;
  /** Pfad in der Quelle, relativ zur Quellwurzel. */
  readonly quellPfad: string;
  /** Schluessel des Fotos. */
  readonly schluessel?: string;
  /** Ablage im Baum ab `_wartend`, nur bei `neu`. */
  readonly ablage?: string;
}

/** Das Ergebnis eines Laufs, so wie die Seite "Import" es zeigt. */
export interface LaufErgebnis {
  readonly quelle: string;
  /** Beginn des Laufs, ISO-8601. */
  readonly begonnen: string;
  /** Ende des Laufs, ISO-8601. */
  readonly beendet: string;
  /** Anzahl der Dateien in der Quelle. */
  readonly gesamt: number;
  readonly neu: number;
  readonly bekannt: number;
  readonly dateien: readonly ErgebnisEintrag[];
  /** Pfad des Protokolls im Foto-Baum, relativ zur Wurzel. */
  readonly protokoll: string;
}

/** Fortschritt eines laufenden Imports: "x von y Dateien". */
export interface Fortschritt {
  readonly erledigt: number;
  readonly gesamt: number;
}

export interface LaufOptionen {
  /** Wurzel des Foto-Baums. */
  readonly wurzel: string;
  readonly quelle: QuellenEinstellung;
  readonly leser: MetadatenLeser;
  /** Wird nach jeder Datei gerufen. */
  readonly melde?: (fortschritt: Fortschritt) => void;
  /** Uhr; in Tests festgehalten. */
  readonly jetzt?: () => Date;
}

/** Eine Datei in der Quelle. */
interface Quelldatei {
  /** Vollstaendiger Pfad. */
  readonly pfad: string;
  /** Pfad relativ zur Quellwurzel, mit `/` als Trenner. */
  readonly quellPfad: string;
  /** Ordner relativ zur Quellwurzel (`''` fuer die Wurzel). */
  readonly ordner: string;
  readonly dateiname: string;
  readonly art: DateiArt;
}

/** Eine Datei samt ihrer Import-Pruefsumme. */
interface GewogeneDatei {
  readonly datei: Quelldatei;
  readonly summe: string;
}

/**
 * Ein Foto samt seinen Sidecars — wird als Einheit uebernommen. `teile`
 * beginnt immer mit dem Foto selbst.
 */
interface Einheit {
  readonly foto: Quelldatei;
  readonly teile: readonly GewogeneDatei[];
  readonly sekundenTeil: SekundenTeil;
  readonly bruchteil: number | undefined;
}

/**
 * Liest die Quelle samt Unterordnern. Nur lesen — es wird nichts
 * geoeffnet, umbenannt oder angelegt.
 */
export async function sammleDateien(wurzel: string, ordner = ''): Promise<Quelldatei[]> {
  const eintraege = await readdir(join(wurzel, ordner), { withFileTypes: true });
  const dateien: Quelldatei[] = [];

  for (const eintrag of [...eintraege].sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (eintrag.isDirectory()) {
      dateien.push(...(await sammleDateien(wurzel, posix.join(ordner, eintrag.name))));
    } else if (eintrag.isFile()) {
      dateien.push({
        pfad: join(wurzel, ordner, eintrag.name),
        quellPfad: posix.join(ordner, eintrag.name),
        ordner,
        dateiname: eintrag.name,
        art: dateiArt(eintrag.name),
      });
    }
  }

  return dateien;
}

/**
 * Reihenfolge der Schluesselvergabe innerhalb einer Sekunde: zuerst der
 * Sekundenbruchteil, sonst der urspruengliche Dateiname aufsteigend.
 */
export function nachAufnahmereihenfolge(a: Einheit, b: Einheit): number {
  if (a.sekundenTeil !== b.sekundenTeil) {
    return a.sekundenTeil < b.sekundenTeil ? -1 : 1;
  }

  if (a.bruchteil !== b.bruchteil) {
    // Ohne Bruchteil laesst sich nur der Name vergleichen; solche Fotos
    // kommen vor denen mit Bruchteil.
    if (a.bruchteil === undefined) {
      return -1;
    }
    if (b.bruchteil === undefined) {
      return 1;
    }
    return a.bruchteil - b.bruchteil;
  }

  if (a.foto.dateiname !== b.foto.dateiname) {
    return a.foto.dateiname < b.foto.dateiname ? -1 : 1;
  }

  return a.foto.quellPfad < b.foto.quellPfad ? -1 : 1;
}

/** Sidecars, die im selben Ordner denselben Grundnamen wie das Foto haben. */
function sidecarsZu(foto: Quelldatei, dateien: readonly Quelldatei[]): Quelldatei[] {
  const basis = grundname(foto.dateiname);

  return dateien.filter(
    (datei) =>
      datei.art === 'sidecar' &&
      datei.ordner === foto.ordner &&
      grundname(datei.dateiname) === basis,
  );
}

function protokollName(quelle: string, jetzt: Date): string {
  const zeit = jetzt.toISOString().replaceAll(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const name = quelle.replaceAll(/[^A-Za-z0-9_-]/g, '_');
  return `${zeit}-${name}.log`;
}

/**
 * Fuehrt einen Lauf aus. Gibt das Ergebnis zurueck; geschrieben wird nur
 * im Foto-Baum, nie in der Quelle.
 */
export async function fuehreLaufAus({
  wurzel,
  quelle,
  leser,
  melde,
  jetzt = () => new Date(),
}: LaufOptionen): Promise<LaufErgebnis> {
  const begonnen = jetzt();
  const gesehen = await GesehenListe.lade(wurzel);
  const dateien = await sammleDateien(quelle.pfad);
  const gesamt = dateien.length;

  const ergebnisse = new Map<string, ErgebnisEintrag>();
  let erledigt = 0;
  melde?.({ erledigt, gesamt });

  const abgeschlossen = (anzahl = 1): void => {
    erledigt += anzahl;
    melde?.({ erledigt, gesamt });
  };

  // Erster Durchgang: einordnen, Pruefsummen bilden, Aufnahmezeit lesen.
  const einheiten: Einheit[] = [];
  for (const datei of dateien) {
    if (!istFoto(datei.art)) {
      // Sidecars gehen mit ihrem Foto, alles andere kommt in einer
      // spaeteren Etappe als "uebersprungen" dazu.
      continue;
    }

    const teile: GewogeneDatei[] = [];
    for (const einzelne of [datei, ...sidecarsZu(datei, dateien)]) {
      teile.push({ datei: einzelne, summe: await pruefsumme(einzelne.pfad) });
    }

    // Eine Datei mit bekannter Import-Pruefsumme ist schon im Archiv —
    // egal, wo sie liegt und unter welchem Namen.
    const bekannt = gesehen.kennt(teile[0]?.summe ?? '');
    if (bekannt !== undefined) {
      for (const teil of teile) {
        const eintrag = gesehen.kennt(teil.summe);
        if (eintrag === undefined) {
          // Ein veraenderter Sidecar zu einem bekannten Foto kommt in
          // einer spaeteren Etappe als "uebersprungen" dazu.
          continue;
        }

        ergebnisse.set(teil.datei.quellPfad, {
          art: 'bekannt',
          quellPfad: teil.datei.quellPfad,
          schluessel: eintrag.schluessel,
        });
        abgeschlossen();
      }

      continue;
    }

    const zeit = await leser.leseAufnahmezeit(datei.pfad);
    if (zeit.art !== 'gelesen') {
      continue;
    }

    einheiten.push({
      foto: datei,
      teile,
      sekundenTeil: sekundenTeil(zeit.zeit),
      bruchteil: zeit.bruchteil,
    });
  }

  // Zweiter Durchgang: Schluessel in Aufnahmereihenfolge vergeben und
  // die Einheit uebernehmen.
  for (const einheit of [...einheiten].sort(nachAufnahmereihenfolge)) {
    const platz = gesehen.naechsterPlatz(einheit.sekundenTeil);
    const schluessel = baueSchluessel(einheit.sekundenTeil, platz);
    gesehen.belegeSchluessel(schluessel);

    await uebernehmeEinheit({ wurzel, quelle, einheit, schluessel, gesehen, jetzt });

    for (const { datei } of einheit.teile) {
      ergebnisse.set(datei.quellPfad, {
        art: 'neu',
        quellPfad: datei.quellPfad,
        schluessel,
        ablage: wartendAnzeige(schluessel, endung(datei.dateiname)),
      });
    }

    abgeschlossen(einheit.teile.length);
  }

  const beendet = jetzt();
  const geordnet = dateien
    .map((datei) => ergebnisse.get(datei.quellPfad))
    .filter((eintrag): eintrag is ErgebnisEintrag => eintrag !== undefined);

  const ergebnis: LaufErgebnis = {
    quelle: quelle.name,
    begonnen: begonnen.toISOString(),
    beendet: beendet.toISOString(),
    gesamt,
    neu: geordnet.filter((eintrag) => eintrag.art === 'neu').length,
    bekannt: geordnet.filter((eintrag) => eintrag.art === 'bekannt').length,
    dateien: geordnet,
    protokoll: posix.join('protokoll', 'import', protokollName(quelle.name, begonnen)),
  };

  await schreibeProtokoll(wurzel, ergebnis);

  return ergebnis;
}

interface UebernahmeOptionen {
  readonly wurzel: string;
  readonly quelle: QuellenEinstellung;
  readonly einheit: Einheit;
  readonly schluessel: string;
  readonly gesehen: GesehenListe;
  readonly jetzt: () => Date;
}

/**
 * Uebernimmt Foto und Sidecars als Einheit: erst alle Kopien pruefen,
 * dann alle Eintraege in die Gesehen-Liste, zuletzt alle in den Baum
 * umbenennen.
 */
async function uebernehmeEinheit({
  wurzel,
  quelle,
  einheit,
  schluessel,
  gesehen,
  jetzt,
}: UebernahmeOptionen): Promise<void> {
  const kopien: { teilPfad: string; zielPfad: string }[] = [];
  const eintraege: GesehenEintrag[] = [];

  for (const { datei, summe } of einheit.teile) {
    const name = `${schluessel}${endung(datei.dateiname)}`;
    const teilPfad = join(teilVerzeichnis(wurzel), name);
    await kopiereGeprueft(datei.pfad, teilPfad, summe);

    kopien.push({ teilPfad, zielPfad: wartendPfad(wurzel, schluessel, endung(datei.dateiname)) });
    eintraege.push({
      pruefsumme: summe,
      schluessel,
      quelle: quelle.name,
      ordner: datei.ordner,
      dateiname: datei.dateiname,
      zeitpunkt: jetzt().toISOString(),
    });
  }

  // Erst vermerken, dann umbenennen: so ist nach einem Absturz immer
  // erkennbar, welche halbe Kopie noch in den Baum gehoert.
  await gesehen.ergaenze(eintraege);

  for (const { teilPfad, zielPfad } of kopien) {
    await uebernehmeTeil(teilPfad, zielPfad);
  }
}
