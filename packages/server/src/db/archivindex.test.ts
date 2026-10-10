import { afterEach, describe, expect, it } from 'vitest';

import { LEERER_STAND, type ArchivIndex, type ArchivStand } from '@knipsa/pipeline';

import { testDatenbank, type TestDatenbank } from '../test/datenbank.js';
import { datenbankIndex } from './archivindex.js';

let datenbank: TestDatenbank | undefined;

afterEach(async () => {
  await datenbank?.schliesse();
  datenbank = undefined;
});

/** Ein Index auf einer frischen Datenbank mit allen Migrationen. */
async function frischerIndex(): Promise<ArchivIndex> {
  datenbank = await testDatenbank();
  return datenbankIndex(datenbank.db);
}

const STAND: ArchivStand = {
  fotos: [
    {
      schluessel: '20190614-101500a',
      aufnahmezeit: '2019-06-14 10:15:00',
      bewertung: 4,
      farbmarkierung: 'Rot',
      stichwoerter: ['Toskana', 'Urlaub'],
      titel: 'Zypressen',
      beschreibung: 'Allee bei Pienza',
      gpsBreite: 43.07,
      gpsLaenge: 11.68,
      vermisst: false,
    },
    {
      schluessel: '20190614-101501a',
      aufnahmezeit: '2019-06-14 10:15:01',
      bewertung: undefined,
      farbmarkierung: undefined,
      stichwoerter: [],
      titel: undefined,
      beschreibung: undefined,
      gpsBreite: undefined,
      gpsLaenge: undefined,
      vermisst: true,
    },
  ],
  dateien: [
    {
      pfad: '_wartend/2019-06/20190614-101500a.NEF',
      schluessel: '20190614-101500a',
      groesse: 1234,
      geaendert: 1_700_000_000_123.5,
      importPruefsumme: 'aa',
      bildPruefsumme: 'bb',
      sidecar: '_wartend/2019-06/20190614-101500a.xmp',
    },
    {
      pfad: '_wartend/2019-06/20190614-101500a.xmp',
      schluessel: '20190614-101500a',
      groesse: 99,
      geaendert: 1_700_000_000_456,
      importPruefsumme: 'cc',
      bildPruefsumme: undefined,
      sidecar: undefined,
    },
  ],
  alarme: [
    { schluessel: '20190614-101500a', art: 'nef', pfad: '_wartend/2019-06/20190614-101500a.NEF' },
  ],
  unbekannte: ['_wartend/2019-06/urlaub.jpg'],
  letzter: {
    art: 'abgleich',
    begonnen: '2026-10-10T08:00:00.000Z',
    beendet: '2026-10-10T08:00:03.000Z',
    dauerMs: 3000,
    fotos: 2,
    dateien: 2,
    vermisst: 1,
    alarme: 1,
    unbekannte: 1,
  },
};

describe('Index in PostgreSQL', () => {
  it('ist vor dem ersten Abgleich leer', async () => {
    const index = await frischerIndex();

    await expect(index.lade()).resolves.toEqual(LEERER_STAND);
    await expect(index.zahlen()).resolves.toEqual({
      fotos: 0,
      dateien: 0,
      vermisst: 0,
      alarme: 0,
      unbekannte: 0,
      letzter: undefined,
    });
  });

  it('gibt einen gespeicherten Stand unveraendert zurueck', async () => {
    const index = await frischerIndex();

    await index.speichere(STAND);

    const gelesen = await index.lade();
    expect([...gelesen.fotos].sort((a, b) => (a.schluessel < b.schluessel ? -1 : 1))).toEqual(
      STAND.fotos,
    );
    expect([...gelesen.dateien].sort((a, b) => (a.pfad < b.pfad ? -1 : 1))).toEqual(STAND.dateien);
    expect(gelesen.alarme).toEqual(STAND.alarme);
    expect(gelesen.unbekannte).toEqual(STAND.unbekannte);
    expect(gelesen.letzter).toEqual(STAND.letzter);
  });

  it('zaehlt Fotos, Dateien, vermisst, Alarme und unbekannte Dateien', async () => {
    const index = await frischerIndex();

    await index.speichere(STAND);

    await expect(index.zahlen()).resolves.toEqual({
      fotos: 2,
      dateien: 2,
      vermisst: 1,
      alarme: 1,
      unbekannte: 1,
      letzter: STAND.letzter,
    });
  });

  it('ersetzt beim Speichern den ganzen Stand', async () => {
    const index = await frischerIndex();
    await index.speichere(STAND);

    await index.speichere({ ...LEERER_STAND, letzter: STAND.letzter });

    const gelesen = await index.lade();
    expect(gelesen.fotos).toHaveLength(0);
    expect(gelesen.dateien).toHaveLength(0);
    expect(gelesen.alarme).toHaveLength(0);
    expect(gelesen.unbekannte).toHaveLength(0);
  });

  it('liefert die Listen hinter den Zahlen', async () => {
    const index = await frischerIndex();
    await index.speichere(STAND);

    await expect(index.liste('fotos', 500)).resolves.toEqual([
      '20190614-101500a',
      '20190614-101501a',
    ]);
    await expect(index.liste('dateien', 500)).resolves.toEqual([
      '_wartend/2019-06/20190614-101500a.NEF',
      '_wartend/2019-06/20190614-101500a.xmp',
    ]);
    await expect(index.liste('vermisst', 500)).resolves.toEqual(['20190614-101501a']);
    await expect(index.liste('unbekannte', 500)).resolves.toEqual(['_wartend/2019-06/urlaub.jpg']);
    await expect(index.liste('alarme', 500)).resolves.toEqual([
      '20190614-101500a — NEF verändert (_wartend/2019-06/20190614-101500a.NEF)',
    ]);
  });

  it('haelt sich an die Grenze einer Liste', async () => {
    const index = await frischerIndex();
    await index.speichere(STAND);

    await expect(index.liste('fotos', 1)).resolves.toEqual(['20190614-101500a']);
  });

  it('gibt zu einem Schluessel Angaben, Dateien und Alarme', async () => {
    const index = await frischerIndex();
    await index.speichere(STAND);

    const auskunft = await index.auskunft('20190614-101500a');

    expect(auskunft?.foto.bewertung).toBe(4);
    expect(auskunft?.foto.stichwoerter).toEqual(['Toskana', 'Urlaub']);
    expect(auskunft?.dateien.map((datei) => datei.pfad)).toEqual([
      '_wartend/2019-06/20190614-101500a.NEF',
      '_wartend/2019-06/20190614-101500a.xmp',
    ]);
    expect(auskunft?.alarme).toEqual(STAND.alarme);
  });

  it('kennt einen unbekannten Schluessel nicht', async () => {
    const index = await frischerIndex();
    await index.speichere(STAND);

    await expect(index.auskunft('20200101-000000a')).resolves.toBeUndefined();
  });

  it('ist nach dem Verwerfen leer', async () => {
    const index = await frischerIndex();
    await index.speichere(STAND);

    await index.verwirf();

    await expect(index.lade()).resolves.toEqual(LEERER_STAND);
  });

  it('schreibt auch einen grossen Stand in einem Zug', async () => {
    const index = await frischerIndex();

    // Mehr Zeilen als in ein `insert` passen: der Index muss sie in
    // Stuecken schreiben, ohne dass der Stand halb ankommt.
    const anzahl = 1200;
    await index.speichere({
      ...LEERER_STAND,
      fotos: Array.from({ length: anzahl }, (_, nummer) => ({
        schluessel: `20190614-10${String(Math.floor(nummer / 60)).padStart(2, '0')}${String(
          nummer % 60,
        ).padStart(2, '0')}a`,
        aufnahmezeit: '2019-06-14 10:15:00',
        bewertung: undefined,
        farbmarkierung: undefined,
        stichwoerter: [],
        titel: undefined,
        beschreibung: undefined,
        gpsBreite: undefined,
        gpsLaenge: undefined,
        vermisst: false,
      })),
    });

    await expect(index.zahlen()).resolves.toMatchObject({ fotos: anzahl });
  });
});
