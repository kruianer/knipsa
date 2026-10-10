import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  dateienText,
  fortschrittText,
  zeichneImport,
  type ImportAktionen,
  type ImportZustand,
} from './importseite.js';

/** Aktionen, von denen der Test nur die interessanten besetzt. */
function aktionen(teile: Partial<ImportAktionen> = {}): ImportAktionen {
  return {
    starte: () => {},
    zeigeOrdner: () => {},
    schliesseOrdner: () => {},
    brecheAb: () => {},
    ...teile,
  };
}

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
      aktionen(),
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
    zeichneImport(
      bereich,
      { ...leer, quellen: [{ name: 'Test', verfuegbar: true }] },
      aktionen({ starte }),
    );

    bereich.querySelector<HTMLButtonElement>('.quelle-start')?.click();

    expect(starte).toHaveBeenCalledWith('Test');
  });

  it('sagt es, wenn keine Quelle eingestellt ist', () => {
    zeichneImport(bereich, leer, aktionen());

    expect(bereich.querySelector('.quellen-leer')?.textContent).toBe('Keine Quelle eingestellt');
  });

  it('zeigt einen Datentraeger mit Bezeichnung und Groesse', () => {
    zeichneImport(
      bereich,
      {
        ...leer,
        quellen: [
          {
            name: 'NIKON D750',
            anzeige: 'NIKON D750 (64 GB)',
            art: 'datentraeger',
            verfuegbar: true,
          },
        ],
      },
      aktionen(),
    );

    const zeile = bereich.querySelector<HTMLElement>('.quelle');
    expect(zeile?.querySelector('.quelle-name')?.textContent).toBe('NIKON D750 (64 GB)');
    expect(zeile?.dataset.quelle).toBe('NIKON D750');
    expect(zeile?.dataset.art).toBe('datentraeger');
  });

  it('zeigt keine Bilder', () => {
    zeichneImport(bereich, { ...leer, quellen: [{ name: 'Test', verfuegbar: true }] }, aktionen());

    expect(bereich.querySelectorAll('img')).toHaveLength(0);
  });
});

describe('Ordner wählen', () => {
  const karte = {
    name: 'NIKON D750',
    anzeige: 'NIKON D750 (64 GB)',
    art: 'datentraeger',
    verfuegbar: true,
  };

  const wahl = {
    quelle: 'NIKON D750',
    ordner: 'DCIM',
    dateien: 3,
    unterordner: [
      { name: '100NIKON', pfad: 'DCIM/100NIKON', dateien: 2, weiter: false },
      { name: '101NIKON', pfad: 'DCIM/101NIKON', dateien: 1, weiter: false },
    ],
  };

  it('bietet bei einem Datentraeger "Ordner wählen …" an, bei einem Ordner nicht', () => {
    zeichneImport(
      bereich,
      { ...leer, quellen: [karte, { name: 'Test', verfuegbar: true }] },
      aktionen(),
    );

    const zeilen = bereich.querySelectorAll('.quelle');
    expect(zeilen[0]?.querySelector('.quelle-ordner')?.textContent).toBe('Ordner wählen …');
    expect(zeilen[1]?.querySelector('.quelle-ordner')).toBeNull();
  });

  it('fragt beim Druck darauf die Wurzel des Datentraegers ab', () => {
    const zeigeOrdner = vi.fn();
    zeichneImport(bereich, { ...leer, quellen: [karte] }, aktionen({ zeigeOrdner }));

    bereich.querySelector<HTMLButtonElement>('.quelle-ordner')?.click();

    expect(zeigeOrdner).toHaveBeenCalledWith('NIKON D750', '');
  });

  it('zeigt je Ordner den Namen und die Anzahl Dateien', () => {
    zeichneImport(bereich, { ...leer, quellen: [karte], ordnerwahl: wahl }, aktionen());

    const block = bereich.querySelector<HTMLElement>('.ordnerwahl');
    expect(block?.dataset.ordner).toBe('DCIM');
    expect(block?.querySelector('.ordnerwahl-pfad')?.textContent).toBe('NIKON D750 / DCIM');

    const zeilen = bereich.querySelectorAll('.ordnerwahl-liste .ordner');
    expect(zeilen).toHaveLength(2);
    expect(zeilen[0]?.querySelector('.ordner-name')?.textContent).toBe('100NIKON');
    expect(zeilen[0]?.querySelector('.ordner-dateien')?.textContent).toBe('2 Dateien');
    expect(zeilen[1]?.querySelector('.ordner-dateien')?.textContent).toBe('1 Datei');
  });

  it('startet mit "Diesen Ordner importieren" den Lauf fuer diesen Ordner', () => {
    const starte = vi.fn();
    zeichneImport(bereich, { ...leer, quellen: [karte], ordnerwahl: wahl }, aktionen({ starte }));

    bereich.querySelectorAll<HTMLButtonElement>('.ordnerwahl-liste .ordner-start')[1]?.click();

    expect(starte).toHaveBeenCalledWith('NIKON D750', 'DCIM/101NIKON');
  });

  it('oeffnet die naechste Ebene nur dort, wo es weitere Ordner gibt', () => {
    const zeigeOrdner = vi.fn();
    zeichneImport(
      bereich,
      {
        ...leer,
        quellen: [karte],
        ordnerwahl: {
          ...wahl,
          ordner: '',
          unterordner: [{ name: 'DCIM', pfad: 'DCIM', dateien: 3, weiter: true }],
        },
      },
      aktionen({ zeigeOrdner }),
    );

    const knopf = bereich.querySelector<HTMLButtonElement>('.ordner-oeffnen');
    expect(knopf?.disabled).toBe(false);
    knopf?.click();
    expect(zeigeOrdner).toHaveBeenCalledWith('NIKON D750', 'DCIM');

    zeichneImport(
      bereich,
      { ...leer, quellen: [karte], ordnerwahl: wahl },
      aktionen({ zeigeOrdner }),
    );
    expect(bereich.querySelector<HTMLButtonElement>('.ordner-oeffnen')?.disabled).toBe(true);
  });

  it('geht eine Ebene hoeher und schliesst die Auswahl wieder', () => {
    const zeigeOrdner = vi.fn();
    const schliesseOrdner = vi.fn();
    zeichneImport(
      bereich,
      { ...leer, quellen: [karte], ordnerwahl: { ...wahl, ordner: 'DCIM/101NIKON' } },
      aktionen({ zeigeOrdner, schliesseOrdner }),
    );

    bereich.querySelector<HTMLButtonElement>('.ordnerwahl-hoch')?.click();
    bereich.querySelector<HTMLButtonElement>('.ordnerwahl-zu')?.click();

    expect(zeigeOrdner).toHaveBeenCalledWith('NIKON D750', 'DCIM');
    expect(schliesseOrdner).toHaveBeenCalledWith();
  });

  it('sagt es, wenn es keine weiteren Ordner gibt', () => {
    zeichneImport(
      bereich,
      { ...leer, quellen: [karte], ordnerwahl: { ...wahl, unterordner: [] } },
      aktionen(),
    );

    expect(bereich.querySelector('.ordnerwahl-leer')?.textContent).toBe('Keine weiteren Ordner');
  });

  it('zeigt die Meldung des Servers, wenn die Ordner nicht zu lesen waren', () => {
    zeichneImport(
      bereich,
      {
        ...leer,
        quellen: [karte],
        ordnerwahl: { ...wahl, unterordner: [], meldung: 'Server nicht erreichbar' },
      },
      aktionen(),
    );

    expect(bereich.querySelector('.ordnerwahl-meldung')?.textContent).toBe(
      'Server nicht erreichbar',
    );
  });
});

describe('Abschluss im Ergebnis', () => {
  /** Ein Lauf-Ergebnis, von dem nur der Abschluss interessiert. */
  function lauf(abschluss: string, ordner?: string): ImportZustand['laeufe'][number] {
    return {
      quelle: 'NIKON D750',
      ...(ordner === undefined ? {} : { ordner }),
      begonnen: '2026-10-10T08:00:00.000Z',
      beendet: '2026-10-10T08:05:00.000Z',
      gesamt: 10,
      neu: 10,
      bekannt: 0,
      uebersprungen: 0,
      problem: 0,
      dateien: [],
      abschluss,
      protokoll: 'protokoll/import/20261010-080000-NIKON_D750.log',
    };
  }

  it('zeigt nach der ganzen Karte den Hinweis zum Formatieren', () => {
    zeichneImport(
      bereich,
      { ...leer, laeufe: [lauf('Vollständig im Archiv — kann formatiert werden')] },
      aktionen(),
    );

    expect(bereich.querySelector('.lauf-abschluss')?.textContent).toContain(
      'Vollständig im Archiv — kann formatiert werden',
    );
  });

  it('zeigt bei einem Problemfall keinen Hinweis zum Formatieren', () => {
    zeichneImport(
      bereich,
      { ...leer, laeufe: [{ ...lauf('nicht vollständig — 1 Problemfall'), problem: 1 }] },
      aktionen(),
    );

    const text = bereich.querySelector('.lauf')?.textContent ?? '';
    expect(text).toContain('nicht vollständig — 1 Problemfall');
    expect(text).not.toContain('kann formatiert werden');
  });

  it('zeigt nach einem Ordner-Lauf nur den Ordner', () => {
    zeichneImport(
      bereich,
      {
        ...leer,
        laeufe: [lauf('Ordner 101NIKON vollständig im Archiv', 'DCIM/101NIKON')],
      },
      aktionen(),
    );

    const block = bereich.querySelector<HTMLElement>('.lauf');
    expect(block?.dataset.ordner).toBe('DCIM/101NIKON');
    expect(block?.textContent).toContain('Ordner 101NIKON vollständig im Archiv');
    expect(block?.textContent).not.toContain('kann formatiert werden');
  });

  it('zeigt einen abgebrochenen Lauf als abgebrochen', () => {
    zeichneImport(
      bereich,
      { ...leer, laeufe: [lauf('abgebrochen — Datenträger entfernt')] },
      aktionen(),
    );

    expect(bereich.querySelector('.lauf-abschluss')?.textContent).toContain(
      'abgebrochen — Datenträger entfernt',
    );
  });
});

describe('dateienText', () => {
  it('nennt die Einzahl in der Einzahl', () => {
    expect(dateienText(0)).toBe('0 Dateien');
    expect(dateienText(1)).toBe('1 Datei');
    expect(dateienText(2)).toBe('2 Dateien');
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
      aktionen(),
    );

    expect(bereich.querySelector('.import-fortschritt')?.textContent).toBe(
      'Test: 7 von 42 Dateien',
    );
    expect(bereich.querySelector<HTMLButtonElement>('.quelle-start')?.disabled).toBe(true);
  });
});

describe('Abbrechen', () => {
  const laufend = {
    quelle: 'NIKON D750',
    begonnen: '2026-10-10T08:00:00.000Z',
    erledigt: 50,
    gesamt: 200,
  };

  it('zeigt waehrend eines Laufs den Knopf Abbrechen und meldet den Druck', () => {
    const brecheAb = vi.fn();
    zeichneImport(bereich, { ...leer, laufend }, aktionen({ brecheAb }));

    const knopf = bereich.querySelector<HTMLButtonElement>('.import-abbrechen');
    expect(knopf?.textContent).toBe('Abbrechen');
    expect(knopf?.disabled).toBe(false);
    knopf?.click();

    expect(brecheAb).toHaveBeenCalledWith();
  });

  it('zeigt ohne laufenden Import keinen Knopf Abbrechen', () => {
    zeichneImport(bereich, leer, aktionen());

    expect(bereich.querySelector('.import-abbrechen')).toBeNull();
  });

  it('sagt es, sobald abgebrochen wird, und sperrt den Knopf', () => {
    zeichneImport(bereich, { ...leer, laufend: { ...laufend, abbruch: 'nutzer' } }, aktionen());

    expect(bereich.querySelector('.import-fortschritt')?.textContent).toBe(
      'NIKON D750: 50 von 200 Dateien — wird abgebrochen, bitte warten …',
    );
    expect(bereich.querySelector<HTMLButtonElement>('.import-abbrechen')?.disabled).toBe(true);
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

    zeichneImport(bereich, { ...leer, laeufe }, aktionen());

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
      aktionen(),
    );

    const lauf = bereich.querySelector('.lauf');
    expect(lauf?.querySelector('summary')?.textContent).toContain('Test');
    expect(lauf?.querySelector('.lauf-abschluss')).toBeNull();
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
