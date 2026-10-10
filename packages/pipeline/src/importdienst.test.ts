import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ImportDienst,
  ImportLaeuftBereits,
  QuelleNichtVerfuegbar,
  UnbekannteQuelle,
  type LaufFunktion,
} from './importdienst.js';
import type { LaufErgebnis } from './importlauf.js';
import type { MetadatenLeser } from './metadaten.js';

let wurzel: string;
let erste: string;
let zweite: string;

beforeEach(async () => {
  const platz = await mkdtemp(join(tmpdir(), 'knipsa-dienst-'));
  wurzel = join(platz, 'fotos');
  erste = await mkdtemp(join(tmpdir(), 'knipsa-quelle-a-'));
  zweite = await mkdtemp(join(tmpdir(), 'knipsa-quelle-b-'));
});

function ergebnis(quelle: string): LaufErgebnis {
  return {
    quelle,
    begonnen: '2026-10-10T08:00:00.000Z',
    beendet: '2026-10-10T08:00:42.000Z',
    gesamt: 42,
    neu: 42,
    bekannt: 0,
    uebersprungen: 0,
    problem: 0,
    dateien: [],
    protokoll: `protokoll/import/20261010-080000-${quelle}.log`,
  };
}

/** Leser, der nie etwas liest — hier zaehlt nur der Ablauf des Dienstes. */
function stubLeser(): MetadatenLeser {
  return {
    leseAufnahmezeit: () => Promise.resolve({ art: 'keineZeit' as const }),
    schliesse: () => Promise.resolve(),
  };
}

/**
 * Ein Lauf, der nach 3 von 42 Dateien stehen bleibt, bis `weiter`
 * gerufen wird. Damit laesst sich der Zustand mitten im Lauf ansehen.
 */
function haltenderLauf(): { lauf: LaufFunktion; weiter: () => void; aufrufe: () => number } {
  let freigeben: () => void = () => {};
  const tor = new Promise<void>((fertig) => {
    freigeben = fertig;
  });
  const beobachtet = vi.fn<LaufFunktion>(async ({ quelle, melde }) => {
    melde({ erledigt: 3, gesamt: 42 });
    await tor;
    return ergebnis(quelle.name);
  });

  return {
    lauf: beobachtet,
    weiter: () => freigeben(),
    aufrufe: () => beobachtet.mock.calls.length,
  };
}

function baueDienst(lauf: LaufFunktion): ImportDienst {
  return new ImportDienst({
    wurzel,
    quellen: [
      { name: 'Test', pfad: erste },
      { name: 'Altbestand', pfad: zweite },
    ],
    lauf,
    leser: stubLeser,
  });
}

describe('Fortschritt eines laufenden Imports', () => {
  it('steht im Dienst und ist bei jeder neuen Abfrage derselbe', async () => {
    const { lauf, weiter } = haltenderLauf();
    const dienst = baueDienst(lauf);

    await dienst.starte('Test');

    // Die Seite neu geladen heisst: den Zustand frisch abfragen. Zweimal
    // dasselbe Ergebnis — der Fortschritt haengt nicht am Browser.
    const erster = await dienst.zustand();
    const nachNeuladen = await dienst.zustand();

    expect(erster.laufend).toEqual({
      quelle: 'Test',
      begonnen: expect.any(String),
      erledigt: 3,
      gesamt: 42,
    });
    expect(nachNeuladen.laufend).toEqual(erster.laufend);

    weiter();
    await dienst.arbeit();

    expect((await dienst.zustand()).laufend).toBeUndefined();
  });

  it('merkt den Lauf nach dem Ende als Ergebnis', async () => {
    const { lauf, weiter } = haltenderLauf();
    const dienst = baueDienst(lauf);

    await dienst.starte('Test');
    weiter();
    await dienst.arbeit();

    const zustand = await dienst.zustand();
    expect(zustand.laeufe).toHaveLength(1);
    expect(zustand.laeufe[0]?.quelle).toBe('Test');
  });
});

describe('nur ein Import gleichzeitig', () => {
  it('weist eine andere Quelle mit "Import läuft bereits" ab', async () => {
    const { lauf, weiter, aufrufe } = haltenderLauf();
    const dienst = baueDienst(lauf);
    await dienst.starte('Test');

    await expect(dienst.starte('Altbestand')).rejects.toThrow(ImportLaeuftBereits);
    await expect(dienst.starte('Altbestand')).rejects.toThrow('Import läuft bereits');

    // Kein zweiter Lauf, und der erste laeuft unveraendert weiter.
    expect(aufrufe()).toBe(1);
    expect((await dienst.zustand()).laufend?.quelle).toBe('Test');

    weiter();
    await dienst.arbeit();
    expect((await dienst.zustand()).laeufe).toHaveLength(1);
  });

  it('weist auch dieselbe Quelle ab, solange sie laeuft', async () => {
    const { lauf, weiter, aufrufe } = haltenderLauf();
    const dienst = baueDienst(lauf);
    await dienst.starte('Test');

    await expect(dienst.starte('Test')).rejects.toThrow(ImportLaeuftBereits);
    expect(aufrufe()).toBe(1);

    weiter();
    await dienst.arbeit();
  });

  it('laesst nach dem Ende wieder einen Lauf zu', async () => {
    const { lauf, weiter } = haltenderLauf();
    const dienst = baueDienst(lauf);
    await dienst.starte('Test');
    weiter();
    await dienst.arbeit();

    await expect(dienst.starte('Altbestand')).resolves.toBeUndefined();
    await dienst.arbeit();
  });
});

describe('Quellen', () => {
  it('meldet je Quelle, ob sie verfuegbar ist', async () => {
    const dienst = new ImportDienst({
      wurzel,
      quellen: [
        { name: 'Test', pfad: erste },
        { name: 'Weg', pfad: join(erste, 'gibt-es-nicht') },
      ],
      lauf: ({ quelle }) => Promise.resolve(ergebnis(quelle.name)),
      leser: stubLeser,
    });

    expect((await dienst.zustand()).quellen).toEqual([
      { name: 'Test', verfuegbar: true },
      { name: 'Weg', verfuegbar: false },
    ]);
  });

  it('startet nichts fuer eine unbekannte oder fehlende Quelle', async () => {
    const { lauf, aufrufe } = haltenderLauf();
    const dienst = new ImportDienst({
      wurzel,
      quellen: [{ name: 'Weg', pfad: join(erste, 'gibt-es-nicht') }],
      lauf,
      leser: stubLeser,
    });

    await expect(dienst.starte('Unbekannt')).rejects.toThrow(UnbekannteQuelle);
    await expect(dienst.starte('Weg')).rejects.toThrow(QuelleNichtVerfuegbar);
    expect(aufrufe()).toBe(0);
    expect((await dienst.zustand()).laufend).toBeUndefined();
  });
});

describe('gescheiterter Lauf', () => {
  it('meldet den Fehler und gibt den Dienst wieder frei', async () => {
    const fehler = vi.fn();
    const dienst = new ImportDienst({
      wurzel,
      quellen: [{ name: 'Test', pfad: erste }],
      lauf: () => Promise.reject(new Error('Platte voll')),
      leser: stubLeser,
      meldeFehler: fehler,
    });

    await dienst.starte('Test');
    await dienst.arbeit();

    expect(fehler).toHaveBeenCalledWith(expect.objectContaining({ message: 'Platte voll' }));
    expect((await dienst.zustand()).laufend).toBeUndefined();
    await expect(dienst.starte('Test')).resolves.toBeUndefined();
    await dienst.arbeit();
  });
});
