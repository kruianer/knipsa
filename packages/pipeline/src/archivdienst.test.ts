import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ArchivDienst, auskunftText } from './archivdienst.js';
import { speicherIndex, type ArchivIndex } from './archivindex.js';
import { GesehenListe } from './gesehen.js';
import { ImportDienst } from './importdienst.js';
import type { LaufErgebnis } from './importlauf.js';
import { KEINE_ANGABEN, type AngabenLeser } from './metadaten.js';
import { Sperre, VorhabenLaeuft } from './sperre.js';
import { nefBytes, schreibeDatei } from './test/testbilder.js';

const SCHLUESSEL = '20190614-101500a';
const MONAT = '_wartend/2019-06';

let wurzel: string;
let index: ArchivIndex;

beforeEach(async () => {
  wurzel = await mkdtemp(join(tmpdir(), 'knipsa-archivdienst-'));
  index = speicherIndex();
});

afterEach(async () => {
  await rm(wurzel, { recursive: true, force: true });
});

/** Leser ohne Angaben — der Index braucht fuer diese Tests nur Schluessel. */
function stillerLeser(): AngabenLeser {
  return {
    leseAngaben: () => Promise.resolve(KEINE_ANGABEN),
    schliesse: () => Promise.resolve(),
  };
}

function dienstMit(optionen: { sperre?: Sperre; taktMs?: number } = {}): ArchivDienst {
  return new ArchivDienst({
    wurzel,
    index,
    leser: stillerLeser,
    ...optionen,
  });
}

/** Legt ein Foto so im Baum ab, wie ein Import es tun wuerde. */
async function legeFotoAb(schluessel = SCHLUESSEL): Promise<void> {
  await schreibeDatei(
    join(wurzel, 'original', MONAT, `${schluessel}.NEF`),
    nefBytes({ datum: '2019:06:14 10:15:00' }),
  );
  const gesehen = await GesehenListe.lade(wurzel);
  await gesehen.ergaenze([
    {
      pruefsumme: `summe-${schluessel}`,
      schluessel,
      quelle: 'Test',
      ordner: '',
      dateiname: 'DSC_0412.NEF',
      zeitpunkt: '2026-10-10T08:00:00.000Z',
    },
  ]);
}

describe('ArchivDienst', () => {
  it('meldet vor dem ersten Abgleich lauter Nullen', async () => {
    const dienst = dienstMit();

    await expect(dienst.zustand()).resolves.toEqual({
      fotos: 0,
      dateien: 0,
      vermisst: 0,
      alarme: 0,
      unbekannte: 0,
      letzter: undefined,
      laufend: undefined,
    });
  });

  it('zaehlt nach einem Abgleich die Fotos und Dateien im Baum', async () => {
    await legeFotoAb();
    const dienst = dienstMit();

    dienst.gleicheAb();
    await dienst.arbeit();

    const zustand = await dienst.zustand();
    expect(zustand.fotos).toBe(1);
    expect(zustand.dateien).toBe(1);
    expect(zustand.laufend).toBeUndefined();
    expect(zustand.letzter?.art).toBe('abgleich');
  });

  it('zeigt die Liste hinter einer Zahl', async () => {
    await legeFotoAb();
    const dienst = dienstMit();
    dienst.gleicheAb();
    await dienst.arbeit();

    await expect(dienst.liste('fotos')).resolves.toEqual([SCHLUESSEL]);
    await expect(dienst.liste('dateien')).resolves.toEqual([`${MONAT}/${SCHLUESSEL}.NEF`]);
  });

  it('schlaegt einen Schluessel als Text nach', async () => {
    await legeFotoAb();
    const dienst = dienstMit();
    dienst.gleicheAb();
    await dienst.arbeit();

    const text = await dienst.nachschlagen(` ${SCHLUESSEL} `);

    expect(text).toContain(`Schlüssel: ${SCHLUESSEL}`);
    expect(text).toContain('Aufnahmezeit: 2019-06-14 10:15:00');
    expect(text).toContain(`${MONAT}/${SCHLUESSEL}.NEF`);
  });

  it('kennt einen Schluessel nicht, der nicht im Index steht', async () => {
    const dienst = dienstMit();

    await expect(dienst.nachschlagen('20200101-000000a')).resolves.toBeUndefined();
  });

  it('weist einen zweiten Abgleich ab, solange einer laeuft', async () => {
    await legeFotoAb();
    const dienst = dienstMit();

    dienst.gleicheAb();
    expect(() => dienst.gleicheAb()).toThrow(VorhabenLaeuft);
    await dienst.arbeit();

    // Danach geht es wieder.
    expect(() => dienst.gleicheAb()).not.toThrow();
    await dienst.arbeit();
  });

  it('gleicht im Takt von selbst ab', async () => {
    await legeFotoAb();
    const dienst = dienstMit({ taktMs: 5 });

    dienst.startePlan();
    try {
      await new Promise((fertig) => setTimeout(fertig, 30));
      await dienst.arbeit();
    } finally {
      dienst.stoppePlan();
    }

    expect((await dienst.zustand()).fotos).toBe(1);
  });
});

describe('Abgleich nach dem Import', () => {
  /** Ein Lauf, der ein Foto in den Baum legt — wie ein echter Import. */
  function laufMitFoto(): LaufErgebnis {
    return {
      quelle: 'Test',
      begonnen: '2026-10-10T08:00:00.000Z',
      beendet: '2026-10-10T08:00:01.000Z',
      gesamt: 1,
      neu: 1,
      bekannt: 0,
      uebersprungen: 0,
      problem: 0,
      dateien: [],
      abschluss: 'Vollständig im Archiv',
      protokoll: 'protokoll/import/lauf.log',
    };
  }

  it('zaehlt ein importiertes Foto, ohne dass jemand "Abgleich jetzt" drueckt', async () => {
    const sperre = new Sperre();
    const archiv = dienstMit({ sperre });

    const importDienst = new ImportDienst({
      wurzel,
      quellen: [{ name: 'Test', pfad: wurzel }],
      sperre,
      nachLauf: () => {
        archiv.gleicheAb();
      },
      leser: () => ({
        leseAufnahmezeit: () => Promise.resolve({ art: 'keineZeit' as const }),
        schliesse: () => Promise.resolve(),
      }),
      lauf: async () => {
        await legeFotoAb();
        return laufMitFoto();
      },
    });

    await importDienst.starte('Test');
    await importDienst.arbeit();
    await archiv.arbeit();

    expect((await archiv.zustand()).fotos).toBe(1);
  });

  it('weist "Neu aufbauen" ab, solange ein Import laeuft, und laesst den Index stehen', async () => {
    await legeFotoAb();
    const sperre = new Sperre();
    const archiv = dienstMit({ sperre });
    archiv.gleicheAb();
    await archiv.arbeit();
    const vorher = await index.lade();

    let abgewiesen: Error | undefined;
    const importDienst = new ImportDienst({
      wurzel,
      quellen: [{ name: 'Test', pfad: wurzel }],
      sperre,
      leser: () => ({
        leseAufnahmezeit: () => Promise.resolve({ art: 'keineZeit' as const }),
        schliesse: () => Promise.resolve(),
      }),
      lauf: () => {
        try {
          archiv.baueNeuAuf();
        } catch (fehler) {
          abgewiesen = fehler as Error;
        }
        return Promise.resolve(laufMitFoto());
      },
    });

    await importDienst.starte('Test');
    await importDienst.arbeit();

    expect(abgewiesen).toBeInstanceOf(VorhabenLaeuft);
    expect(abgewiesen?.message).toBe('Import läuft — bitte warten');
    await expect(index.lade()).resolves.toEqual(vorher);
  });

  it('laesst Import und Abgleich nie gleichzeitig laufen', async () => {
    const sperre = new Sperre();
    const archiv = dienstMit({ sperre });

    let gleichzeitig: Error | undefined;
    const importDienst = new ImportDienst({
      wurzel,
      quellen: [{ name: 'Test', pfad: wurzel }],
      sperre,
      leser: () => ({
        leseAufnahmezeit: () => Promise.resolve({ art: 'keineZeit' as const }),
        schliesse: () => Promise.resolve(),
      }),
      lauf: async () => {
        // Mitten im Import: der Abgleich muss abgewiesen werden.
        try {
          archiv.gleicheAb();
        } catch (fehler) {
          gleichzeitig = fehler as Error;
        }
        await legeFotoAb();
        return laufMitFoto();
      },
    });

    await importDienst.starte('Test');
    await importDienst.arbeit();

    expect(gleichzeitig).toBeInstanceOf(VorhabenLaeuft);
    expect(gleichzeitig?.message).toBe('Import läuft — bitte warten');
  });
});

describe('auskunftText', () => {
  it('zeigt leere Felder als Gedankenstrich und den Zustand normal', () => {
    const text = auskunftText({
      foto: {
        schluessel: SCHLUESSEL,
        aufnahmezeit: '2019-06-14 10:15:00',
        bewertung: undefined,
        farbmarkierung: undefined,
        stichwoerter: [],
        titel: undefined,
        beschreibung: undefined,
        gpsBreite: undefined,
        gpsLaenge: undefined,
        vermisst: false,
      },
      dateien: [],
      alarme: [],
    });

    expect(text).toContain('Bewertung: —');
    expect(text).toContain('Stichwörter: —');
    expect(text).toContain('Zustand: normal');
  });

  it('zeigt eine einzelne Bewertung in der Einzahl', () => {
    const text = auskunftText({
      foto: {
        schluessel: SCHLUESSEL,
        aufnahmezeit: '2019-06-14 10:15:00',
        bewertung: 1,
        farbmarkierung: 'Rot',
        stichwoerter: ['Toskana'],
        titel: 'Zypressen',
        beschreibung: 'Allee',
        gpsBreite: 43.07,
        gpsLaenge: 11.68,
        vermisst: false,
      },
      dateien: [],
      alarme: [],
    });

    expect(text).toContain('Bewertung: 1 Stern');
    expect(text).toContain('Farbmarkierung: Rot');
    expect(text).toContain('GPS: 43.07, 11.68');
  });
});
