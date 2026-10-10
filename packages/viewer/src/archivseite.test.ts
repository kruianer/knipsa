import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  NEU_AUFBAUEN_FRAGE,
  letzterText,
  zeichneArchiv,
  type ArchivAktionen,
  type ArchivZustand,
} from './archivseite.js';
import { dauerText } from './zeit.js';

let bereich: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = '<main id="app"><section id="archiv"></section></main>';
  const gefunden = document.querySelector<HTMLElement>('#archiv');
  if (gefunden === null) {
    throw new Error('#archiv fehlt');
  }
  bereich = gefunden;
});

const KEINE_AKTIONEN: ArchivAktionen = {
  gleicheAb: () => {},
  frageNeuAufbau: () => {},
  baueNeuAuf: () => {},
  verwirfNachfrage: () => {},
  klappe: () => {},
  schlageNach: () => {},
};

const ZUSTAND: ArchivZustand = {
  fotos: 120,
  dateien: 231,
  vermisst: 1,
  alarme: 2,
  unbekannte: 3,
  letzter: {
    art: 'abgleich',
    begonnen: '2026-10-10T08:00:00.000Z',
    beendet: '2026-10-10T08:00:12.000Z',
    dauerMs: 12_000,
    fotos: 120,
    dateien: 231,
    vermisst: 1,
    alarme: 2,
    unbekannte: 3,
  },
};

function zeichne(zustand: ArchivZustand, aktionen: Partial<ArchivAktionen> = {}): void {
  zeichneArchiv(bereich, zustand, { ...KEINE_AKTIONEN, ...aktionen });
}

function zahl(art: string): HTMLElement | null {
  return bereich.querySelector<HTMLElement>(`.archiv-zahl[data-art="${art}"]`);
}

describe('Bereich Archiv', () => {
  it('zeigt jede Zahl mit ihrer Beschriftung', () => {
    zeichne(ZUSTAND);

    expect(bereich.querySelector('h2')?.textContent).toBe('Archiv');
    expect(zahl('fotos')?.querySelector('.zahl-knopf')?.textContent).toBe('Fotos: 120');
    expect(zahl('dateien')?.querySelector('.zahl-knopf')?.textContent).toBe('Dateien: 231');
    expect(zahl('vermisst')?.querySelector('.zahl-knopf')?.textContent).toBe('vermisst: 1');
    expect(zahl('alarme')?.querySelector('.zahl-knopf')?.textContent).toBe('Alarme: 2');
    expect(zahl('unbekannte')?.querySelector('.zahl-knopf')?.textContent).toBe(
      'unbekannte Dateien: 3',
    );
  });

  it('zeigt den letzten Abgleich mit Zeitpunkt und Dauer', () => {
    zeichne(ZUSTAND);

    const text = bereich.querySelector('.archiv-letzter')?.textContent ?? '';
    expect(text).toContain('Letzter Abgleich');
    expect(text).toContain('12 Sekunden');
  });

  it('sagt, wenn noch kein Abgleich lief', () => {
    zeichne({ ...ZUSTAND, letzter: undefined });

    expect(bereich.querySelector('.archiv-letzter')?.textContent).toBe(
      'Letzter Abgleich: noch keiner',
    );
  });

  it('zeigt keine Bilder', () => {
    zeichne(ZUSTAND);

    expect(bereich.querySelectorAll('img')).toHaveLength(0);
  });

  it('klappt eine Zahl auf Knopfdruck auf', () => {
    const klappe = vi.fn();
    zeichne(ZUSTAND, { klappe });

    zahl('vermisst')?.querySelector<HTMLButtonElement>('.zahl-knopf')?.click();

    expect(klappe).toHaveBeenCalledWith('vermisst');
  });

  it('zeigt die Zeilen einer aufgeklappten Liste', () => {
    zeichne({ ...ZUSTAND, listen: { vermisst: ['20190614-101500a'] } });

    const liste = zahl('vermisst')?.querySelector('.zahl-liste');
    expect(liste?.textContent).toContain('20190614-101500a');
    expect(zahl('vermisst')?.querySelector('.zahl-knopf')?.getAttribute('aria-expanded')).toBe(
      'true',
    );
  });

  it('sagt bei einer leeren Liste, dass nichts dabei ist', () => {
    zeichne({ ...ZUSTAND, listen: { alarme: [] } });

    expect(zahl('alarme')?.querySelector('.zahl-leer')?.textContent).toBe('Nichts dabei');
  });

  it('startet einen Abgleich auf Knopfdruck', () => {
    const gleicheAb = vi.fn();
    zeichne(ZUSTAND, { gleicheAb });

    bereich.querySelector<HTMLButtonElement>('.archiv-abgleich')?.click();

    expect(gleicheAb).toHaveBeenCalled();
  });

  it('fragt vor dem Neuaufbau nach und baut erst nach dem Ja neu auf', () => {
    const frageNeuAufbau = vi.fn();
    const baueNeuAuf = vi.fn();

    zeichne(ZUSTAND, { frageNeuAufbau, baueNeuAuf });
    bereich.querySelector<HTMLButtonElement>('.archiv-neu')?.click();
    expect(frageNeuAufbau).toHaveBeenCalled();
    expect(baueNeuAuf).not.toHaveBeenCalled();

    zeichne({ ...ZUSTAND, nachfrage: true }, { baueNeuAuf });
    expect(bereich.querySelector('.nachfrage-text')?.textContent).toBe(NEU_AUFBAUEN_FRAGE);

    bereich.querySelector<HTMLButtonElement>('.nachfrage-ja')?.click();
    expect(baueNeuAuf).toHaveBeenCalled();
  });

  it('sperrt die Knoepfe, solange ein Vorhaben laeuft, und sagt welches', () => {
    zeichne({ ...ZUSTAND, laufend: 'import' });

    expect(bereich.querySelector<HTMLButtonElement>('.archiv-abgleich')?.disabled).toBe(true);
    expect(bereich.querySelector<HTMLButtonElement>('.archiv-neu')?.disabled).toBe(true);
    expect(bereich.querySelector<HTMLElement>('.archiv-laufend')?.dataset.laufend).toBe('import');
  });

  it('zeigt die Meldung des Servers', () => {
    zeichne({ ...ZUSTAND, meldung: 'Import läuft — bitte warten' });

    const meldung = bereich.querySelector('.archiv-meldung');
    expect(meldung?.textContent).toBe('Import läuft — bitte warten');
    expect(meldung?.getAttribute('role')).toBe('status');
  });

  it('schlaegt einen eingegebenen Schluessel nach', () => {
    const schlageNach = vi.fn();
    zeichne(ZUSTAND, { schlageNach });

    const feld = bereich.querySelector<HTMLInputElement>('.nachschlagen-feld');
    if (feld === null) {
      throw new Error('Feld fehlt');
    }
    feld.value = '20190614-101500a';
    bereich.querySelector<HTMLButtonElement>('.nachschlagen-knopf')?.click();

    expect(schlageNach).toHaveBeenCalledWith('20190614-101500a');
  });

  it('zeigt die Angaben eines Fotos als Text', () => {
    zeichne({
      ...ZUSTAND,
      auskunft: {
        schluessel: '20190614-101500a',
        text: 'Schlüssel: 20190614-101500a\nBewertung: 4 Sterne\nStichwörter: Toskana\n',
      },
    });

    const auskunft = bereich.querySelector<HTMLElement>('.nachschlagen-auskunft');
    expect(auskunft?.dataset.schluessel).toBe('20190614-101500a');
    expect(auskunft?.textContent).toContain('4 Sterne');
    expect(auskunft?.textContent).toContain('Toskana');
  });

  it('zeigt die Meldung, wenn ein Schluessel nicht gefunden wurde', () => {
    zeichne({
      ...ZUSTAND,
      auskunft: { schluessel: '20200101-000000a', meldung: 'Schlüssel nicht gefunden' },
    });

    expect(bereich.querySelector('.nachschlagen-meldung')?.textContent).toBe(
      'Schlüssel nicht gefunden',
    );
    expect(bereich.querySelector('.nachschlagen-auskunft')).toBeNull();
  });

  it('zeichnet beim zweiten Lauf nicht doppelt', () => {
    zeichne(ZUSTAND);
    zeichne(ZUSTAND);

    expect(bereich.querySelectorAll('h2')).toHaveLength(1);
    expect(bereich.querySelectorAll('.archiv-zahl')).toHaveLength(5);
  });
});

describe('letzterText', () => {
  it('nennt einen Neuaufbau als solchen', () => {
    expect(
      letzterText({
        art: 'neuaufbau',
        begonnen: '2026-10-10T08:00:00.000Z',
        beendet: '2026-10-10T08:00:01.000Z',
        dauerMs: 1000,
        fotos: 0,
        dateien: 0,
        vermisst: 0,
        alarme: 0,
        unbekannte: 0,
      }),
    ).toContain('Letzter Neuaufbau');
  });
});

describe('dauerText', () => {
  it('nennt kurze Laeufe, Sekunden und Minuten', () => {
    expect(dauerText(0)).toBe('unter 1 Sekunde');
    expect(dauerText(999)).toBe('unter 1 Sekunde');
    expect(dauerText(1000)).toBe('1 Sekunde');
    expect(dauerText(12_000)).toBe('12 Sekunden');
    expect(dauerText(60_000)).toBe('1 Minute');
    expect(dauerText(65_000)).toBe('1 Minute 5 Sekunden');
    expect(dauerText(125_000)).toBe('2 Minuten 5 Sekunden');
  });

  it('nennt eine unsinnige Dauer unbekannt', () => {
    expect(dauerText(-1)).toBe('unbekannt');
    expect(dauerText(Number.NaN)).toBe('unbekannt');
  });
});
