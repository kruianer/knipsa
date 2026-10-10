import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fortschrittText, zeichneImport, type ImportZustand } from './importseite.js';

let bereich: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = '<main id="app"><section id="import"></section></main>';
  const gefunden = document.querySelector<HTMLElement>('#import');
  if (gefunden === null) {
    throw new Error('#import fehlt');
  }
  bereich = gefunden;
});

const leer: ImportZustand = { quellen: [], laeufe: [] };

describe('Quellen', () => {
  it('zeigt je Quelle Name, Zustand und den Knopf Importieren', () => {
    zeichneImport(
      bereich,
      {
        ...leer,
        quellen: [
          { name: 'Test', verfuegbar: true },
          { name: 'Altbestand', verfuegbar: false },
        ],
      },
      () => {},
    );

    const zeilen = bereich.querySelectorAll('.quelle');
    expect(zeilen).toHaveLength(2);
    expect(zeilen[0]?.querySelector('.quelle-name')?.textContent).toBe('Test');
    expect(zeilen[0]?.querySelector('.quelle-zustand')?.textContent).toBe('verfügbar');
    expect(zeilen[0]?.querySelector<HTMLButtonElement>('.quelle-start')?.disabled).toBe(false);
    expect(zeilen[1]?.querySelector('.quelle-zustand')?.textContent).toBe('nicht verfügbar');
    expect(zeilen[1]?.querySelector<HTMLButtonElement>('.quelle-start')?.disabled).toBe(true);
  });

  it('meldet den Namen der Quelle beim Druck auf Importieren', () => {
    const starte = vi.fn();
    zeichneImport(bereich, { ...leer, quellen: [{ name: 'Test', verfuegbar: true }] }, starte);

    bereich.querySelector<HTMLButtonElement>('.quelle-start')?.click();

    expect(starte).toHaveBeenCalledWith('Test');
  });

  it('sagt es, wenn keine Quelle eingestellt ist', () => {
    zeichneImport(bereich, leer, () => {});

    expect(bereich.querySelector('.quellen-leer')?.textContent).toBe('Keine Quelle eingestellt');
  });

  it('zeigt keine Bilder', () => {
    zeichneImport(bereich, { ...leer, quellen: [{ name: 'Test', verfuegbar: true }] }, () => {});

    expect(bereich.querySelectorAll('img')).toHaveLength(0);
  });
});

describe('Fortschritt', () => {
  it('zeigt x von y Dateien', () => {
    expect(
      fortschrittText({
        quelle: 'Test',
        begonnen: '2026-10-10T08:00:00.000Z',
        erledigt: 7,
        gesamt: 42,
      }),
    ).toBe('7 von 42 Dateien');
  });

  it('sperrt waehrend eines Laufs alle Knoepfe', () => {
    zeichneImport(
      bereich,
      {
        ...leer,
        quellen: [{ name: 'Test', verfuegbar: true }],
        laufend: { quelle: 'Test', begonnen: '2026-10-10T08:00:00.000Z', erledigt: 7, gesamt: 42 },
      },
      () => {},
    );

    expect(bereich.querySelector('.import-fortschritt')?.textContent).toBe(
      'Test: 7 von 42 Dateien',
    );
    expect(bereich.querySelector<HTMLButtonElement>('.quelle-start')?.disabled).toBe(true);
  });
});

describe('Ergebnis', () => {
  it('zeigt jeden Lauf, den der Server meldet', () => {
    const laeufe = Array.from({ length: 10 }, (_eintrag, stelle) => ({
      quelle: `Test ${stelle + 1}`,
      begonnen: '2026-10-10T08:00:00.000Z',
      beendet: '2026-10-10T08:00:05.000Z',
      gesamt: 0,
      neu: 0,
      bekannt: 0,
      uebersprungen: 0,
      problem: 0,
      dateien: [],
      protokoll: `protokoll/import/lauf-${stelle + 1}.log`,
    }));

    zeichneImport(bereich, { ...leer, laeufe }, () => {});

    const bloecke = bereich.querySelectorAll<HTMLElement>('.lauf');
    expect(bloecke).toHaveLength(10);
    expect(bloecke[0]?.dataset.quelle).toBe('Test 1');
    expect(bloecke[9]?.dataset.quelle).toBe('Test 10');
  });

  it('zeigt je Lauf Quelle, Zeitpunkt und Zahlen, aufklappbar je Datei', () => {
    zeichneImport(
      bereich,
      {
        ...leer,
        laeufe: [
          {
            quelle: 'Test',
            begonnen: '2026-10-10T08:00:00.000Z',
            beendet: '2026-10-10T08:00:05.000Z',
            gesamt: 4,
            neu: 1,
            bekannt: 1,
            uebersprungen: 1,
            problem: 1,
            dateien: [
              {
                art: 'neu',
                quellPfad: 'Toskana 2019/DSC_0412.NEF',
                schluessel: '20190614-101500a',
                ablage: '_wartend/2019-06/20190614-101500a.NEF',
              },
              {
                art: 'bekannt',
                quellPfad: 'Toskana 2019/DSC_0413.NEF',
                schluessel: '20190614-101502a',
              },
              {
                art: 'uebersprungen',
                quellPfad: 'Toskana 2019/IMG_0001.MOV',
                grund: 'Video',
              },
              {
                art: 'problem',
                quellPfad: 'handy/IMG_4711.JPG',
                grund: 'keine Aufnahmezeit',
              },
            ],
            protokoll: 'protokoll/import/20261010-080000-Test.log',
          },
        ],
      },
      () => {},
    );

    const lauf = bereich.querySelector('.lauf');
    expect(lauf?.querySelector('summary')?.textContent).toContain('Test');
    expect(lauf?.querySelector('summary')?.textContent).toContain(
      '1 neu, 1 schon bekannt, 1 übersprungen, 1 Problem',
    );

    const zeilen = lauf?.querySelectorAll('.lauf-dateien li') ?? [];
    expect(zeilen[0]?.textContent).toBe(
      'Toskana 2019/DSC_0412.NEF → _wartend/2019-06/20190614-101500a.NEF',
    );
    expect(zeilen[1]?.textContent).toBe(
      'Toskana 2019/DSC_0413.NEF → schon bekannt als 20190614-101502a',
    );
    expect(zeilen[2]?.textContent).toBe('Toskana 2019/IMG_0001.MOV → übersprungen: Video');
    expect(zeilen[3]?.textContent).toBe('handy/IMG_4711.JPG → Problem: keine Aufnahmezeit');
  });
});
