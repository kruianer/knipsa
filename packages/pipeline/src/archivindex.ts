/**
 * Der Index ueber den Foto-Baum: was Knipsa ueber Fotos und Dateien weiss.
 *
 * Der Index ist ein Abbild, keine Wahrheit: alles darin laesst sich aus
 * dem Foto-Baum und der Gesehen-Liste neu aufbauen (siehe
 * `delivery/vision.md`, "Datei vor Datenbank"). Deshalb steht hier nur
 * die Schnittstelle samt einem Index im Arbeitsspeicher; die Ablage in
 * PostgreSQL liegt beim Server (`packages/server/src/db/archivindex.ts`).
 */

/** Art eines Alarms "Original verändert". */
export type AlarmArt = 'nef' | 'bilddaten';

/** Wortlaut der Alarme auf der Seite. */
export const ALARM_TEXT: Record<AlarmArt, string> = {
  nef: 'NEF verändert',
  bilddaten: 'Bilddaten verändert',
};

/** Ein Foto im Index. */
export interface IndexFoto {
  readonly schluessel: string;
  /** Aufnahmezeit wie im Schluessel: `JJJJ-MM-TT HH:MM:SS`, ohne Zeitzone. */
  readonly aufnahmezeit: string;
  readonly bewertung: number | undefined;
  readonly farbmarkierung: string | undefined;
  readonly stichwoerter: readonly string[];
  readonly titel: string | undefined;
  readonly beschreibung: string | undefined;
  readonly gpsBreite: number | undefined;
  readonly gpsLaenge: number | undefined;
  /**
   * `true`, wenn es zu diesem Schluessel keine Datei mehr im Baum gibt.
   * Der Schluessel bleibt trotzdem im Index — er ist aus der
   * Gesehen-Liste bekannt und zaehlt weiter als Foto.
   */
  readonly vermisst: boolean;
}

/** Eine Datei im Index. */
export interface IndexDatei {
  /** Pfad ab `original`, mit `/` als Trenner. */
  readonly pfad: string;
  readonly schluessel: string;
  readonly groesse: number;
  /** Aenderungszeit in Millisekunden seit 1970. */
  readonly geaendert: number;
  /** Pruefsumme der ganzen Datei, wie sie jetzt im Baum liegt. */
  readonly importPruefsumme: string;
  /** Pruefsumme nur der Bilddaten; bei einem Sidecar leer. */
  readonly bildPruefsumme: string | undefined;
  /** Sidecar dieser Datei, Pfad ab `original`; nur bei einer NEF. */
  readonly sidecar: string | undefined;
}

/** Ein Alarm: das Original hinter diesem Schluessel hat sich veraendert. */
export interface IndexAlarm {
  readonly schluessel: string;
  readonly art: AlarmArt;
  /** Pfad der betroffenen Datei ab `original`. */
  readonly pfad: string;
}

/** Was ein Abgleich oder Neuaufbau gekostet und gefunden hat. */
export interface AbgleichLauf {
  readonly art: 'abgleich' | 'neuaufbau';
  readonly begonnen: string;
  readonly beendet: string;
  readonly dauerMs: number;
  readonly fotos: number;
  readonly dateien: number;
  readonly vermisst: number;
  readonly alarme: number;
  readonly unbekannte: number;
}

/** Der vollstaendige Index — so, wie ein Abgleich ihn hinterlaesst. */
export interface ArchivStand {
  readonly fotos: readonly IndexFoto[];
  readonly dateien: readonly IndexDatei[];
  readonly alarme: readonly IndexAlarm[];
  /** Dateien im Baum ohne gueltigen Schluessel im Namen, Pfad ab `original`. */
  readonly unbekannte: readonly string[];
  readonly letzter: AbgleichLauf | undefined;
}

/** Ein leerer Index — der Stand vor dem ersten Abgleich. */
export const LEERER_STAND: ArchivStand = {
  fotos: [],
  dateien: [],
  alarme: [],
  unbekannte: [],
  letzter: undefined,
};

/** Die Zahlen des Bereichs "Archiv". */
export interface ArchivZahlen {
  readonly fotos: number;
  readonly dateien: number;
  readonly vermisst: number;
  readonly alarme: number;
  readonly unbekannte: number;
  readonly letzter: AbgleichLauf | undefined;
}

/** Zahl des Bereichs "Archiv", zu der es eine Liste gibt. */
export type ListenArt = 'fotos' | 'dateien' | 'vermisst' | 'alarme' | 'unbekannte';

export const LISTEN_ARTEN: readonly ListenArt[] = [
  'fotos',
  'dateien',
  'vermisst',
  'alarme',
  'unbekannte',
];

/** `true`, wenn der Text eine Listen-Art benennt. */
export function istListenArt(wert: string): wert is ListenArt {
  return (LISTEN_ARTEN as readonly string[]).includes(wert);
}

/** Alles, was das Nachschlagen eines Schluessels zeigt. */
export interface FotoAuskunft {
  readonly foto: IndexFoto;
  readonly dateien: readonly IndexDatei[];
  readonly alarme: readonly IndexAlarm[];
}

/**
 * Ablage des Index. Der Abgleich schreibt den Stand immer ganz — damit
 * gibt es keinen halben Index, und der Stand bleibt genau das, was der
 * letzte Lauf im Baum gesehen hat.
 */
export interface ArchivIndex {
  /** Der gespeicherte Stand; vor dem ersten Abgleich der leere Stand. */
  lade(): Promise<ArchivStand>;
  /** Ersetzt den Stand vollstaendig. */
  speichere(stand: ArchivStand): Promise<void>;
  /** Verwirft den Index; danach ist er leer. */
  verwirf(): Promise<void>;
  /** Die Zahlen des Bereichs "Archiv", ohne die Listen zu laden. */
  zahlen(): Promise<ArchivZahlen>;
  /** Eine Liste hinter einer Zahl, hoechstens `grenze` Zeilen. */
  liste(art: ListenArt, grenze: number): Promise<readonly string[]>;
  /** Die Angaben zu einem Schluessel; `undefined`, wenn unbekannt. */
  auskunft(schluessel: string): Promise<FotoAuskunft | undefined>;
}

/** Eine Zeile der Alarm-Liste. */
export function alarmZeile(alarm: IndexAlarm): string {
  return `${alarm.schluessel} — ${ALARM_TEXT[alarm.art]} (${alarm.pfad})`;
}

/** Zahlen zu einem Stand — dieselben, die der letzte Lauf gemeldet hat. */
export function zahlenZu(stand: ArchivStand): ArchivZahlen {
  return {
    fotos: stand.fotos.length,
    dateien: stand.dateien.length,
    vermisst: stand.fotos.filter((foto) => foto.vermisst).length,
    alarme: stand.alarme.length,
    unbekannte: stand.unbekannte.length,
    letzter: stand.letzter,
  };
}

/** Die Liste hinter einer Zahl, aus einem Stand im Arbeitsspeicher. */
export function listeZu(stand: ArchivStand, art: ListenArt, grenze: number): string[] {
  const zeilen = (): string[] => {
    switch (art) {
      case 'fotos':
        return [...stand.fotos].map((foto) => foto.schluessel).sort();
      case 'dateien':
        return [...stand.dateien].map((datei) => datei.pfad).sort();
      case 'vermisst':
        return stand.fotos
          .filter((foto) => foto.vermisst)
          .map((foto) => foto.schluessel)
          .sort();
      case 'alarme':
        return [...stand.alarme].map(alarmZeile).sort();
      case 'unbekannte':
        return [...stand.unbekannte].sort();
    }
  };

  return zeilen().slice(0, grenze);
}

/**
 * Index im Arbeitsspeicher. Im Betrieb liegt der Index in PostgreSQL;
 * dieser hier dient Tests und dem Fall, dass die Pipeline ohne Datenbank
 * laeuft.
 */
export function speicherIndex(): ArchivIndex {
  let stand: ArchivStand = LEERER_STAND;

  return {
    lade: (): Promise<ArchivStand> => Promise.resolve(stand),

    speichere: (neu: ArchivStand): Promise<void> => {
      stand = neu;
      return Promise.resolve();
    },

    verwirf: (): Promise<void> => {
      stand = LEERER_STAND;
      return Promise.resolve();
    },

    zahlen: (): Promise<ArchivZahlen> => Promise.resolve(zahlenZu(stand)),

    liste: (art: ListenArt, grenze: number): Promise<readonly string[]> =>
      Promise.resolve(listeZu(stand, art, grenze)),

    auskunft: (schluessel: string): Promise<FotoAuskunft | undefined> => {
      const foto = stand.fotos.find((eintrag) => eintrag.schluessel === schluessel);
      if (foto === undefined) {
        return Promise.resolve(undefined);
      }

      return Promise.resolve({
        foto,
        dateien: stand.dateien.filter((datei) => datei.schluessel === schluessel),
        alarme: stand.alarme.filter((alarm) => alarm.schluessel === schluessel),
      });
    },
  };
}
