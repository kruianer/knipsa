import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { laeufeDatei } from '@knipsa/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import type { LaufErgebnis } from './importlauf.js';
import { ladeLaeufe, MAX_LAEUFE, merkeLauf } from './laeufe.js';

let wurzel: string;

beforeEach(async () => {
  wurzel = join(await mkdtemp(join(tmpdir(), 'knipsa-laeufe-')), 'fotos');
});

function lauf(nummer: number): LaufErgebnis {
  const stunde = String(nummer).padStart(2, '0');
  return {
    quelle: `Test ${nummer}`,
    begonnen: `2026-10-10T${stunde}:00:00.000Z`,
    beendet: `2026-10-10T${stunde}:00:30.000Z`,
    gesamt: 1,
    neu: 1,
    bekannt: 0,
    uebersprungen: 0,
    problem: 0,
    dateien: [],
    abschluss: 'Vollständig im Archiv',
    protokoll: `protokoll/import/20261010-${stunde}0000-Test.log`,
  };
}

describe('die letzten Laeufe', () => {
  it('sind leer, solange es keinen gab', async () => {
    expect(await ladeLaeufe(wurzel)).toEqual([]);
  });

  it('stehen mit dem neuesten zuerst', async () => {
    await merkeLauf(wurzel, lauf(1));
    await merkeLauf(wurzel, lauf(2));

    expect((await ladeLaeufe(wurzel)).map((eintrag) => eintrag.quelle)).toEqual([
      'Test 2',
      'Test 1',
    ]);
  });

  it('sind nach 11 Laeufen genau die 10 neuesten', async () => {
    for (let nummer = 1; nummer <= 11; nummer += 1) {
      await merkeLauf(wurzel, lauf(nummer));
    }

    const liste = await ladeLaeufe(wurzel);

    expect(liste).toHaveLength(MAX_LAEUFE);
    expect(liste.map((eintrag) => eintrag.quelle)).toEqual([
      'Test 11',
      'Test 10',
      'Test 9',
      'Test 8',
      'Test 7',
      'Test 6',
      'Test 5',
      'Test 4',
      'Test 3',
      'Test 2',
    ]);
  });

  it('ueberstehen einen Neustart, weil sie im Foto-Baum liegen', async () => {
    await merkeLauf(wurzel, lauf(1));

    // Frisch gelesen, ohne jeden Zustand im Prozess.
    expect(await ladeLaeufe(wurzel)).toEqual([lauf(1)]);
  });
});

describe('unbrauchbare Datei', () => {
  it('wird wie "keine Laeufe" behandelt, statt den Start zu verhindern', async () => {
    await merkeLauf(wurzel, lauf(1));
    await writeFile(laeufeDatei(wurzel), '{kein JSON', 'utf8');

    expect(await ladeLaeufe(wurzel)).toEqual([]);
  });

  it('uebergeht Eintraege, die kein Ergebnis sind', async () => {
    await merkeLauf(wurzel, lauf(1));
    const liste: unknown[] = [{ quelle: 'kaputt' }, lauf(2)];
    await writeFile(laeufeDatei(wurzel), JSON.stringify(liste), 'utf8');

    expect(await ladeLaeufe(wurzel)).toEqual([lauf(2)]);
  });

  it('schreibt die Liste als lesbares JSON', async () => {
    await merkeLauf(wurzel, lauf(1));

    const inhalt = await readFile(laeufeDatei(wurzel), 'utf8');
    expect(inhalt.endsWith('\n')).toBe(true);
    expect(JSON.parse(inhalt)).toEqual([lauf(1)]);
  });
});
