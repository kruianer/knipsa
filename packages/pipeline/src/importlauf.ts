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
import { ordnerPfad, pruefeOrdner } from './ordnerbaum.js';
import { legeProblemAb } from './problem.js';
import { schreibeProtokoll } from './protokoll.js';
import { raeumeTeileAuf } from './teilaufraeumen.js';

/** Wie eine Datei im Ergebnis eines Laufs gezaehlt wird. */
export type ErgebnisArt = 'neu' | 'bekannt' | 'uebersprungen' | 'problem';

/** Art einer Quelle: eingestellter Ordner oder eingesteckter Datentraeger. */
export type QuellenArt = 'ordner' | 'datentraeger';

/**
 * Die Quelle eines Laufs. Eingestellte Ordner kommen aus
 * `IMPORT_QUELLEN` (req-005), Datentraeger vom Einhaengepunkt (req-006).
 */
export interface Quelle extends QuellenEinstellung {
  readonly art: QuellenArt;
}

/** Begruendungen fuer einen Problemfall — Wortlaut wie auf der Seite. */
export const GRUND_KEINE_AUFNAHMEZEIT = 'keine Aufnahmezeit';
export const GRUND_SIDECAR_OHNE_FOTO = 'Sidecar ohne Foto';
export const GRUND_BESCHAEDIGT = 'beschädigt';

/** Begruendungen fuer eine uebersprungene Datei — nichts wird kopiert. */
export const GRUND_VIDEO = 'Video';
export const GRUND_ANDERER_DATEITYP = 'anderer Dateityp';
export const GRUND_JPEG_NEBEN_NEF = 'JPEG neben gleichnamiger NEF';
export const GRUND_SIDECAR_BEKANNT = 'Sidecar zu bekanntem Foto nicht übernommen';
export const GRUND_SIDECAR_PROBLEM = 'Sidecar zu Problemfall nicht übernommen';

/**
 * Warum ein Lauf vorzeitig endet: `nutzer` auf Knopfdruck, `entfernt`
 * weil der Datentraeger herausgezogen wurde.
 */
export type AbbruchGrund = 'nutzer' | 'entfernt';

/** Eine Datei im Ergebnis eines Laufs. */
export interface ErgebnisEintrag {
  readonly art: ErgebnisArt;
  /** Pfad in der Quelle, relativ zur Quellwurzel. */
  readonly quellPfad: string;
  /** Schluessel des Fotos. */
  readonly schluessel?: string;
  /** Ablage im Baum ab `_wartend`, nur bei `neu`. */
  readonly ablage?: string;
  /** Begruendung, bei `uebersprungen` und `problem`. */
  readonly grund?: string;
}

/** Das Ergebnis eines Laufs, so wie die Seite "Import" es zeigt. */
export interface LaufErgebnis {
  readonly quelle: string;
  /**
   * Ordner in der Quelle, auf den der Lauf begrenzt war; fehlt bei einem
   * Lauf ueber die ganze Quelle.
   */
  readonly ordner?: string;
  /** Beginn des Laufs, ISO-8601. */
  readonly begonnen: string;
  /** Ende des Laufs, ISO-8601. */
  readonly beendet: string;
  /** Anzahl der Dateien in der Quelle. */
  readonly gesamt: number;
  readonly neu: number;
  readonly bekannt: number;
  readonly uebersprungen: number;
  readonly problem: number;
  readonly dateien: readonly ErgebnisEintrag[];
  /** Grund, falls der Lauf vorzeitig endete; fehlt bei einem ganzen Lauf. */
  readonly abgebrochen?: AbbruchGrund;
  /**
   * Abschluss des Laufs im Wortlaut der Seite: "abgebrochen",
   * "Vollständig im Archiv — kann formatiert werden" und so weiter.
   */
  readonly abschluss: string;
  /** Pfad des Protokolls im Foto-Baum, relativ zur Wurzel. */
  readonly protokoll: string;
}

/** Was der Abschluss-Satz eines Laufs braucht. */
export interface AbschlussAngaben {
  readonly art: QuellenArt;
  /** Ordner, auf den der Lauf begrenzt war; `''` ist die ganze Quelle. */
  readonly ordner: string;
  readonly abgebrochen: AbbruchGrund | undefined;
  readonly problem: number;
}

/**
 * Der Abschluss-Satz eines Laufs — die Antwort auf "darf ich die Karte
 * jetzt formatieren?".
 *
 * Nur ein Lauf ueber einen ganzen Datentraeger, der weder abgebrochen
 * wurde noch einen Problemfall hatte, darf zum Formatieren raten. Nach
 * einem Ordner-Lauf sagt der Satz nichts ueber den Rest des Mediums und
 * deshalb nichts ueber das Formatieren.
 */
export function abschlussText({ art, ordner, abgebrochen, problem }: AbschlussAngaben): string {
  if (abgebrochen === 'entfernt') {
    return 'abgebrochen — Datenträger entfernt';
  }
  if (abgebrochen !== undefined) {
    return 'abgebrochen';
  }
  if (problem > 0) {
    return `nicht vollständig — ${problem} ${problem === 1 ? 'Problemfall' : 'Problemfälle'}`;
  }
  if (ordner !== '') {
    const name = ordner.split('/').at(-1) ?? ordner;
    return `Ordner ${name} vollständig im Archiv`;
  }

  return art === 'datentraeger'
    ? 'Vollständig im Archiv — kann formatiert werden'
    : 'Vollständig im Archiv';
}

/** Fortschritt eines laufenden Imports: "x von y Dateien". */
export interface Fortschritt {
  readonly erledigt: number;
  readonly gesamt: number;
}

export interface LaufOptionen {
  /** Wurzel des Foto-Baums. */
  readonly wurzel: string;
  readonly quelle: Quelle;
  /**
   * Ordner in der Quelle, der importiert wird — samt Unterordnern. Ohne
   * Angabe die ganze Quelle.
   */
  readonly ordner?: string;
  readonly leser: MetadatenLeser;
  /**
   * Wird vor jeder Datei gefragt. Gibt sie einen Grund, endet der Lauf
   * nach der gerade bearbeiteten Datei. Darf nachsehen gehen (zum
   * Beispiel, ob der Datentraeger noch steckt) und deshalb warten.
   */
  readonly abbruch?: () => AbbruchGrund | undefined | Promise<AbbruchGrund | undefined>;
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

/**
 * `true`, wenn im selben Ordner eine NEF mit demselben Grundnamen liegt.
 * Nur dann gehoert ein Sidecar zu einem Foto; ein JPEG daneben ist dann
 * nur eine Ansicht der NEF und wird uebersprungen.
 */
function hatNefDaneben(datei: Quelldatei, dateien: readonly Quelldatei[]): boolean {
  const basis = grundname(datei.dateiname);

  return dateien.some(
    (andere) =>
      andere.art === 'raw' &&
      andere.ordner === datei.ordner &&
      grundname(andere.dateiname) === basis,
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
  ordner = '',
  leser,
  abbruch,
  melde,
  jetzt = () => new Date(),
}: LaufOptionen): Promise<LaufErgebnis> {
  const begonnen = jetzt();
  const gesehen = await GesehenListe.lade(wurzel);

  // Zuerst die Spuren eines abgebrochenen Laufs klaeren: entweder gehoert
  // eine liegengebliebene Kopie ins Archiv, oder sie wird verworfen.
  await raeumeTeileAuf(wurzel, gesehen);

  // Ein gewaehlter Ordner wird geprueft, bevor daraus gelesen wird; die
  // Pfade im Ergebnis bleiben relativ zur Quellwurzel.
  const begrenzt = pruefeOrdner(ordner);
  if (begrenzt !== '') {
    await ordnerPfad(quelle.pfad, begrenzt);
  }

  const dateien = await sammleDateien(quelle.pfad, begrenzt);
  const gesamt = dateien.length;

  const ergebnisse = new Map<string, ErgebnisEintrag>();
  let erledigt = 0;
  melde?.({ erledigt, gesamt });

  const abgeschlossen = (anzahl = 1): void => {
    erledigt += anzahl;
    melde?.({ erledigt, gesamt });
  };

  /** Legt eine Datei als Problemfall ab und vermerkt sie im Ergebnis. */
  const alsProblem = async (datei: Quelldatei, summe: string, grund: string): Promise<void> => {
    await legeProblemAb({
      wurzel,
      pfad: datei.pfad,
      dateiname: datei.dateiname,
      summe,
      grund,
      quelle: quelle.name,
      quellPfad: datei.quellPfad,
      zeitpunkt: jetzt().toISOString(),
    });

    ergebnisse.set(datei.quellPfad, { art: 'problem', quellPfad: datei.quellPfad, grund });
    abgeschlossen();
  };

  /** Vermerkt eine Datei als uebersprungen; kopiert wird dabei nichts. */
  const uebersprungen = (datei: Quelldatei, grund: string): void => {
    ergebnisse.set(datei.quellPfad, { art: 'uebersprungen', quellPfad: datei.quellPfad, grund });
    abgeschlossen();
  };

  // Ein Abbruch wirkt immer erst nach der gerade bearbeiteten Datei:
  // dann ist entweder alles an ihr fertig oder nichts von ihr begonnen.
  let abgebrochen: AbbruchGrund | undefined;
  const sollWeiter = async (): Promise<boolean> => {
    abgebrochen = abgebrochen ?? (await abbruch?.());
    return abgebrochen === undefined;
  };

  /**
   * Faellt eine Datei mitten in der Arbeit aus, ist das kein Fehler des
   * Archivs, wenn die Quelle inzwischen weg ist — der Lauf gilt dann als
   * abgebrochen. Alles andere bleibt ein Fehler.
   */
  const alsAbbruchDeuten = async (fehler: unknown): Promise<boolean> => {
    abgebrochen = abgebrochen ?? (await abbruch?.());
    if (abgebrochen === undefined) {
      throw fehler;
    }
    return true;
  };

  const einheiten: Einheit[] = [];

  /** Ordnet eine Datei ein: Pruefsumme bilden, Aufnahmezeit lesen. */
  const ordneEin = async (datei: Quelldatei): Promise<void> => {
    if (datei.art === 'video') {
      uebersprungen(datei, GRUND_VIDEO);
      return;
    }
    if (datei.art === 'anderes') {
      uebersprungen(datei, GRUND_ANDERER_DATEITYP);
      return;
    }

    if (datei.art === 'sidecar') {
      // Ein Sidecar ohne eigene NEF gehoert zu keinem Foto. Mit NEF geht
      // es als Teil ihrer Einheit mit.
      if (!hatNefDaneben(datei, dateien)) {
        await alsProblem(datei, await pruefsumme(datei.pfad), GRUND_SIDECAR_OHNE_FOTO);
      }
      return;
    }

    // Ein JPEG neben einer gleichnamigen NEF ist nur eine Ansicht davon.
    if (datei.art === 'jpeg' && hatNefDaneben(datei, dateien)) {
      uebersprungen(datei, GRUND_JPEG_NEBEN_NEF);
      return;
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
          // Ein veraenderter Sidecar zu einem schon bekannten Foto wird
          // nicht uebernommen (Varianten und neue Sidecars: req-007).
          uebersprungen(teil.datei, GRUND_SIDECAR_BEKANNT);
          continue;
        }

        ergebnisse.set(teil.datei.quellPfad, {
          art: 'bekannt',
          quellPfad: teil.datei.quellPfad,
          schluessel: eintrag.schluessel,
        });
        abgeschlossen();
      }

      return;
    }

    const eigeneSumme = teile[0]?.summe ?? '';
    const zeit = await leser.leseAufnahmezeit(datei.pfad);
    if (zeit.art !== 'gelesen') {
      await alsProblem(
        datei,
        eigeneSumme,
        zeit.art === 'beschaedigt' ? GRUND_BESCHAEDIGT : GRUND_KEINE_AUFNAHMEZEIT,
      );

      // Ohne Schluessel fuer das Foto hat sein Sidecar nichts, woran es
      // haengen koennte.
      for (const teil of teile.slice(1)) {
        uebersprungen(teil.datei, GRUND_SIDECAR_PROBLEM);
      }
      return;
    }

    einheiten.push({
      foto: datei,
      teile,
      sekundenTeil: sekundenTeil(zeit.zeit),
      bruchteil: zeit.bruchteil,
    });
  };

  /** Vergibt den Schluessel einer Einheit und uebernimmt sie in den Baum. */
  const uebernimm = async (einheit: Einheit): Promise<void> => {
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
  };

  // Erster Durchgang: einordnen, Pruefsummen bilden, Aufnahmezeit lesen.
  for (const datei of dateien) {
    if (!(await sollWeiter())) {
      break;
    }

    try {
      await ordneEin(datei);
    } catch (fehler) {
      await alsAbbruchDeuten(fehler);
      break;
    }
  }

  // Zweiter Durchgang: Schluessel in Aufnahmereihenfolge vergeben und
  // die Einheit uebernehmen.
  for (const einheit of [...einheiten].sort(nachAufnahmereihenfolge)) {
    if (!(await sollWeiter())) {
      break;
    }

    try {
      await uebernimm(einheit);
    } catch (fehler) {
      await alsAbbruchDeuten(fehler);
      break;
    }
  }

  if (abgebrochen !== undefined) {
    // Ein Abbruch mitten in einer Datei kann eine halbe Kopie
    // hinterlassen haben. Sie wird hier geklaert, statt bis zum naechsten
    // Lauf liegen zu bleiben.
    await raeumeTeileAuf(wurzel, gesehen);
  }

  const beendet = jetzt();
  const geordnet = dateien
    .map((datei) => ergebnisse.get(datei.quellPfad))
    .filter((eintrag): eintrag is ErgebnisEintrag => eintrag !== undefined);

  const problem = geordnet.filter((eintrag) => eintrag.art === 'problem').length;
  const ergebnis: LaufErgebnis = {
    quelle: quelle.name,
    ...(begrenzt === '' ? {} : { ordner: begrenzt }),
    begonnen: begonnen.toISOString(),
    beendet: beendet.toISOString(),
    gesamt,
    neu: geordnet.filter((eintrag) => eintrag.art === 'neu').length,
    bekannt: geordnet.filter((eintrag) => eintrag.art === 'bekannt').length,
    uebersprungen: geordnet.filter((eintrag) => eintrag.art === 'uebersprungen').length,
    problem,
    dateien: geordnet,
    ...(abgebrochen === undefined ? {} : { abgebrochen }),
    abschluss: abschlussText({ art: quelle.art, ordner: begrenzt, abgebrochen, problem }),
    protokoll: posix.join('protokoll', 'import', protokollName(quelle.name, begonnen)),
  };

  await schreibeProtokoll(wurzel, ergebnis);

  return ergebnis;
}

interface UebernahmeOptionen {
  readonly wurzel: string;
  readonly quelle: Quelle;
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
