import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import {
  existiert,
  kopiereGeprueft,
  KopieFehler,
  pruefsumme,
  uebernehmeTeil,
  verwerfeTeildatei,
} from './archiv.js';
import { teilVerzeichnis } from './fotobaum.js';

let wurzel: string;
let quelle: string;

beforeEach(async () => {
  wurzel = await mkdtemp(join(tmpdir(), 'knipsa-archiv-'));
  quelle = join(wurzel, 'quelle.bin');
  await writeFile(quelle, 'Bilddaten');
});

describe('pruefsumme', () => {
  it('ist fuer gleichen Inhalt gleich und fuer anderen verschieden', async () => {
    const zwilling = join(wurzel, 'zwilling.bin');
    await writeFile(zwilling, 'Bilddaten');
    const anders = join(wurzel, 'anders.bin');
    await writeFile(anders, 'Bilddaten!');

    expect(await pruefsumme(quelle)).toBe(await pruefsumme(zwilling));
    expect(await pruefsumme(quelle)).not.toBe(await pruefsumme(anders));
  });
});

describe('kopiereGeprueft', () => {
  it('kopiert bytegleich nach .import-teil', async () => {
    const teil = join(teilVerzeichnis(wurzel), '20190614-101500a.bin');

    await kopiereGeprueft(quelle, teil, await pruefsumme(quelle));

    expect(await readFile(teil, 'utf8')).toBe('Bilddaten');
  });

  it('verwirft die Kopie, wenn die Pruefsumme nicht stimmt', async () => {
    const teil = join(teilVerzeichnis(wurzel), '20190614-101500a.bin');

    await expect(kopiereGeprueft(quelle, teil, 'falsche-summe')).rejects.toThrow(KopieFehler);
    expect(await existiert(teil)).toBe(false);
  });
});

describe('uebernehmeTeil', () => {
  it('legt die geprueften Kopie im Baum ab und raeumt .import-teil', async () => {
    const teil = join(teilVerzeichnis(wurzel), '20190614-101500a.bin');
    const ziel = join(wurzel, 'original', '_wartend', '2019-06', '20190614-101500a.bin');
    await kopiereGeprueft(quelle, teil, await pruefsumme(quelle));

    await uebernehmeTeil(teil, ziel);

    expect(await readFile(ziel, 'utf8')).toBe('Bilddaten');
    expect(await existiert(teil)).toBe(false);
  });
});

describe('verwerfeTeildatei', () => {
  it('verwirft eine halbe Kopie in .import-teil', async () => {
    const teil = join(teilVerzeichnis(wurzel), 'halb.bin');
    await kopiereGeprueft(quelle, teil, await pruefsumme(quelle));

    await verwerfeTeildatei(wurzel, teil);

    expect(await existiert(teil)).toBe(false);
  });

  it('weist jeden Pfad ausserhalb von .import-teil ab', async () => {
    await expect(verwerfeTeildatei(wurzel, quelle)).rejects.toThrow(/import-teil/);
    expect(await existiert(quelle)).toBe(true);
  });
});
