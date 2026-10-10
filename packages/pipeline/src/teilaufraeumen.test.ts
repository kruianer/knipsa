import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { existiert, pruefsumme, teilVerzeichnis, wartendPfad } from '@knipsa/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { GesehenListe } from './gesehen.js';
import { raeumeImportTeileAuf, raeumeTeileAuf } from './teilaufraeumen.js';
import { nefBytes, schreibeDatei } from './test/testbilder.js';

let wurzel: string;

const SCHLUESSEL = '20190614-101500a';
const BYTES = nefBytes({ datum: '2019:06:14 10:15:00' });

beforeEach(async () => {
  wurzel = join(await mkdtemp(join(tmpdir(), 'knipsa-aufraeumen-')), 'fotos');
});

function teilPfad(name: string): string {
  return join(teilVerzeichnis(wurzel), name);
}

/** Stellt den Zustand "Kopie geprueft und vermerkt, aber nicht umbenannt" her. */
async function vermerkt(): Promise<void> {
  await schreibeDatei(teilPfad(`${SCHLUESSEL}.NEF`), BYTES);
  const gesehen = await GesehenListe.lade(wurzel);
  await gesehen.ergaenze([
    {
      pruefsumme: await pruefsumme(teilPfad(`${SCHLUESSEL}.NEF`)),
      schluessel: SCHLUESSEL,
      quelle: 'Test',
      ordner: 'Toskana 2019',
      dateiname: 'DSC_0412.NEF',
      zeitpunkt: '2026-10-10T08:00:00.000Z',
    },
  ]);
}

describe('vermerkte Kopie', () => {
  it('wird in den Wartebereich uebernommen', async () => {
    await vermerkt();

    const ergebnis = await raeumeImportTeileAuf(wurzel);

    expect(ergebnis.uebernommen).toEqual([`${SCHLUESSEL}.NEF`]);
    expect(await readFile(wartendPfad(wurzel, SCHLUESSEL, '.NEF'))).toEqual(BYTES);
    expect(await readdir(teilVerzeichnis(wurzel))).toEqual([]);
  });

  it('wird verworfen, wenn sie im Wartebereich schon liegt', async () => {
    await vermerkt();
    await schreibeDatei(wartendPfad(wurzel, SCHLUESSEL, '.NEF'), BYTES);

    const ergebnis = await raeumeImportTeileAuf(wurzel);

    expect(ergebnis.verworfen).toEqual([`${SCHLUESSEL}.NEF`]);
    expect(await readFile(wartendPfad(wurzel, SCHLUESSEL, '.NEF'))).toEqual(BYTES);
  });
});

describe('halbe Kopie', () => {
  it('wird verworfen, wenn sie nicht in der Gesehen-Liste steht', async () => {
    await schreibeDatei(teilPfad(`${SCHLUESSEL}.NEF`), BYTES.subarray(0, 20));

    const ergebnis = await raeumeImportTeileAuf(wurzel);

    expect(ergebnis.verworfen).toEqual([`${SCHLUESSEL}.NEF`]);
    expect(await existiert(wartendPfad(wurzel, SCHLUESSEL, '.NEF'))).toBe(false);
    expect(await readdir(teilVerzeichnis(wurzel))).toEqual([]);
  });

  it('wird verworfen, wenn ihr Inhalt nicht zum vermerkten Schluessel passt', async () => {
    await vermerkt();
    // Dieselbe Stelle, aber anderer Inhalt — der Vermerk gehoert nicht dazu.
    await schreibeDatei(teilPfad(`${SCHLUESSEL}.NEF`), BYTES.subarray(0, 20));

    const ergebnis = await raeumeImportTeileAuf(wurzel);

    expect(ergebnis.verworfen).toEqual([`${SCHLUESSEL}.NEF`]);
    expect(await existiert(wartendPfad(wurzel, SCHLUESSEL, '.NEF'))).toBe(false);
  });

  it('wird verworfen, wenn ihr Name kein Schluessel ist', async () => {
    await schreibeDatei(teilPfad('problem-IMG_4711.JPG'), 'halb');

    const ergebnis = await raeumeImportTeileAuf(wurzel);

    expect(ergebnis.verworfen).toEqual(['problem-IMG_4711.JPG']);
    expect(await readdir(teilVerzeichnis(wurzel))).toEqual([]);
  });
});

describe('ohne Spuren', () => {
  it('tut nichts, wenn es .import-teil nicht gibt', async () => {
    const ergebnis = await raeumeImportTeileAuf(wurzel);

    expect(ergebnis).toEqual({ uebernommen: [], verworfen: [] });
    expect(await existiert(teilVerzeichnis(wurzel))).toBe(false);
  });

  it('nimmt Schluessel, die erst im laufenden Lauf belegt wurden, nicht als vermerkt', async () => {
    await schreibeDatei(teilPfad(`${SCHLUESSEL}.NEF`), BYTES);
    const gesehen = await GesehenListe.lade(wurzel);
    gesehen.belegeSchluessel(SCHLUESSEL);

    const ergebnis = await raeumeTeileAuf(wurzel, gesehen);

    expect(ergebnis.verworfen).toEqual([`${SCHLUESSEL}.NEF`]);
  });
});
