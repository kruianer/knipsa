import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { findeDatentraeger, groesseText, istEingehaengt } from './datentraeger.js';

let wurzel: string;

beforeEach(async () => {
  wurzel = await mkdtemp(join(tmpdir(), 'knipsa-medien-'));
});

/** Haelt jeden angelegten Ordner fuer eingehaengt — so wie nach dem Einstecken. */
const alleEingehaengt = { eingehaengt: () => Promise.resolve(true) };

describe('groesseText', () => {
  it('nennt eine 64-GB-Karte 64 GB', () => {
    // Hersteller rechnen dezimal; eine 64-GB-Karte meldet etwas weniger.
    expect(groesseText(63_864_569_856)).toBe('64 GB');
  });

  it('nennt kleine und grosse Datentraeger in passenden Einheiten', () => {
    expect(groesseText(32 * 1_000_000_000)).toBe('32 GB');
    expect(groesseText(512 * 1_000_000)).toBe('512 MB');
    expect(groesseText(2_000_000_000_000)).toBe('2 TB');
    expect(groesseText(1_500_000_000_000)).toBe('1,5 TB');
  });

  it('sagt es, wenn die Groesse unbekannt ist', () => {
    expect(groesseText(0)).toBe('unbekannte Größe');
  });
});

describe('istEingehaengt', () => {
  it('ist falsch fuer einen gewoehnlichen Ordner', async () => {
    const ordner = join(wurzel, 'NIKON D750');
    await mkdir(ordner);

    expect(await istEingehaengt(ordner)).toBe(false);
  });

  it('ist falsch fuer einen Ordner, den es nicht gibt', async () => {
    expect(await istEingehaengt(join(wurzel, 'weg'))).toBe(false);
  });

  it('ist wahr fuer einen echten Einhaengepunkt', async () => {
    // `/proc` ist auf Linux immer eingehaengt — ein Einhaengepunkt zum
    // Anfassen, ohne im Test selbst etwas einhaengen zu muessen.
    expect(await istEingehaengt('/proc')).toBe(process.platform === 'linux');
  });
});

describe('findeDatentraeger', () => {
  it('nennt je Datentraeger Bezeichnung, Pfad und Beschriftung mit Groesse', async () => {
    await mkdir(join(wurzel, 'NIKON D750'));

    expect(
      await findeDatentraeger(wurzel, {
        ...alleEingehaengt,
        groesse: () => Promise.resolve(63_864_569_856),
      }),
    ).toEqual([
      {
        name: 'NIKON D750',
        pfad: join(wurzel, 'NIKON D750'),
        groesse: 63_864_569_856,
        anzeige: 'NIKON D750 (64 GB)',
      },
    ]);
  });

  it('uebergeht einen Ordner, der nicht eingehaengt ist', async () => {
    // Nach dem Herausziehen bleibt der leere Ordner manchmal stehen.
    await mkdir(join(wurzel, 'NIKON D750'));

    expect(await findeDatentraeger(wurzel)).toEqual([]);
  });

  it('uebergeht Dateien neben den Einhaengepunkten', async () => {
    await writeFile(join(wurzel, 'hinweis.txt'), 'kein Datentraeger');

    expect(
      await findeDatentraeger(wurzel, {
        eingehaengt: (pfad) => Promise.resolve(pfad.endsWith('hinweis.txt')),
      }),
    ).toEqual([]);
  });

  it('sortiert nach Bezeichnung', async () => {
    await mkdir(join(wurzel, 'USB-Stick'));
    await mkdir(join(wurzel, 'NIKON D750'));

    expect(
      (
        await findeDatentraeger(wurzel, { ...alleEingehaengt, groesse: () => Promise.resolve(0) })
      ).map((traeger) => traeger.name),
    ).toEqual(['NIKON D750', 'USB-Stick']);
  });

  it('findet ohne eingestellten Ordner nichts', async () => {
    expect(await findeDatentraeger('')).toEqual([]);
    expect(await findeDatentraeger(join(wurzel, 'gibt-es-nicht'))).toEqual([]);
  });
});
