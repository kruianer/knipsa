import { describe, expect, it } from 'vitest';

import {
  alarmZeile,
  istListenArt,
  LEERER_STAND,
  listeZu,
  speicherIndex,
  zahlenZu,
  type ArchivStand,
} from './archivindex.js';

const STAND: ArchivStand = {
  fotos: [
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
    {
      schluessel: '20190614-101500a',
      aufnahmezeit: '2019-06-14 10:15:00',
      bewertung: 4,
      farbmarkierung: undefined,
      stichwoerter: ['Toskana'],
      titel: undefined,
      beschreibung: undefined,
      gpsBreite: undefined,
      gpsLaenge: undefined,
      vermisst: false,
    },
  ],
  dateien: [
    {
      pfad: '_wartend/2019-06/20190614-101500a.NEF',
      schluessel: '20190614-101500a',
      groesse: 10,
      geaendert: 1,
      importPruefsumme: 'aa',
      bildPruefsumme: 'bb',
      sidecar: undefined,
    },
  ],
  alarme: [
    { schluessel: '20190614-101500a', art: 'nef', pfad: '_wartend/2019-06/20190614-101500a.NEF' },
  ],
  unbekannte: ['_wartend/2019-06/urlaub.jpg'],
  letzter: undefined,
};

describe('zahlenZu', () => {
  it('zaehlt Fotos, Dateien, vermisst, Alarme und unbekannte Dateien', () => {
    expect(zahlenZu(STAND)).toEqual({
      fotos: 2,
      dateien: 1,
      vermisst: 1,
      alarme: 1,
      unbekannte: 1,
      letzter: undefined,
    });
  });
});

describe('listeZu', () => {
  it('gibt jede Liste sortiert und bis zur Grenze', () => {
    expect(listeZu(STAND, 'fotos', 500)).toEqual(['20190614-101500a', '20190614-101501a']);
    expect(listeZu(STAND, 'fotos', 1)).toEqual(['20190614-101500a']);
    expect(listeZu(STAND, 'vermisst', 500)).toEqual(['20190614-101501a']);
    expect(listeZu(STAND, 'dateien', 500)).toEqual(['_wartend/2019-06/20190614-101500a.NEF']);
    expect(listeZu(STAND, 'unbekannte', 500)).toEqual(['_wartend/2019-06/urlaub.jpg']);
  });

  it('schreibt einen Alarm im Wortlaut der Seite', () => {
    expect(listeZu(STAND, 'alarme', 500)).toEqual([
      '20190614-101500a — NEF verändert (_wartend/2019-06/20190614-101500a.NEF)',
    ]);
    expect(alarmZeile({ schluessel: '20190614-101500a', art: 'bilddaten', pfad: 'a/b.jpg' })).toBe(
      '20190614-101500a — Bilddaten verändert (a/b.jpg)',
    );
  });
});

describe('istListenArt', () => {
  it('kennt die Listen der Seite und sonst nichts', () => {
    expect(istListenArt('fotos')).toBe(true);
    expect(istListenArt('alarme')).toBe(true);
    expect(istListenArt('bilder')).toBe(false);
  });
});

describe('speicherIndex', () => {
  it('ist zu Beginn leer', async () => {
    const index = speicherIndex();

    await expect(index.lade()).resolves.toEqual(LEERER_STAND);
  });

  it('gibt zurueck, was gespeichert wurde', async () => {
    const index = speicherIndex();

    await index.speichere(STAND);

    await expect(index.lade()).resolves.toEqual(STAND);
    await expect(index.zahlen()).resolves.toMatchObject({ fotos: 2, vermisst: 1 });
  });

  it('gibt zu einem Schluessel seine Dateien und Alarme', async () => {
    const index = speicherIndex();
    await index.speichere(STAND);

    const auskunft = await index.auskunft('20190614-101500a');

    expect(auskunft?.foto.bewertung).toBe(4);
    expect(auskunft?.dateien).toHaveLength(1);
    expect(auskunft?.alarme).toHaveLength(1);
  });

  it('ist nach dem Verwerfen wieder leer', async () => {
    const index = speicherIndex();
    await index.speichere(STAND);

    await index.verwirf();

    await expect(index.lade()).resolves.toEqual(LEERER_STAND);
  });
});
