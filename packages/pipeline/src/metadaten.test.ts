import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { deuteTags, exiftoolLeser, zerlegeZeitangabe, type MetadatenLeser } from './metadaten.js';
import {
  heicBytes,
  jpegBytes,
  kaputteJpegBytes,
  nefBytes,
  schreibeDatei,
} from './test/testbilder.js';

describe('zerlegeZeitangabe', () => {
  it('liest die Angabe, ohne sie umzurechnen', () => {
    expect(zerlegeZeitangabe('2019:06:14 10:15:00')).toEqual({
      zeit: { jahr: 2019, monat: 6, tag: 14, stunde: 10, minute: 15, sekunde: 0 },
      bruchteil: undefined,
    });
  });

  it('nimmt den Bruchteil aus der Angabe oder aus dem eigenen Feld', () => {
    expect(zerlegeZeitangabe('2019:06:14 10:15:00.120')?.bruchteil).toBeCloseTo(0.12);
    expect(zerlegeZeitangabe('2019:06:14 10:15:00', '7')?.bruchteil).toBeCloseTo(0.7);
  });

  it('laesst eine Zeitzone unberuecksichtigt, statt umzurechnen', () => {
    expect(zerlegeZeitangabe('2019:06:14 10:15:00+02:00')?.zeit.stunde).toBe(10);
  });

  it('weist ab, was keine Zeitangabe ist', () => {
    expect(zerlegeZeitangabe('')).toBeUndefined();
    expect(zerlegeZeitangabe('0000:00:00 00:00:00')).toBeUndefined();
    expect(zerlegeZeitangabe('irgendwann')).toBeUndefined();
  });
});

describe('deuteTags', () => {
  it('nimmt DateTimeOriginal vor CreateDate', () => {
    const ergebnis = deuteTags({
      DateTimeOriginal: '2019:06:14 10:15:00',
      CreateDate: '2020:01:01 00:00:00',
    });

    expect(ergebnis).toEqual({
      art: 'gelesen',
      zeit: { jahr: 2019, monat: 6, tag: 14, stunde: 10, minute: 15, sekunde: 0 },
      bruchteil: undefined,
    });
  });

  it('meldet "keine Aufnahmezeit", wenn kein Feld gesetzt ist', () => {
    expect(deuteTags({}).art).toBe('keineZeit');
  });

  it('meldet "beschaedigt" bei einem schweren Hinweis', () => {
    expect(deuteTags({ Warning: 'JPEG format error' })).toEqual({
      art: 'beschaedigt',
      grund: 'JPEG format error',
    });
  });

  it('uebergeht einen harmlosen Hinweis', () => {
    expect(
      deuteTags({
        Warning: '[minor] Skipped unknown 18 bytes',
        DateTimeOriginal: '2019:06:14 10:15:00',
      }).art,
    ).toBe('gelesen');
  });
});

/** Diese Tests lesen mit echtem `exiftool` aus echten Dateien. */
describe('exiftoolLeser', () => {
  let leser: MetadatenLeser;
  let ordner: string;

  beforeAll(async () => {
    leser = exiftoolLeser();
    ordner = await mkdtemp(join(tmpdir(), 'knipsa-metadaten-'));
  });

  afterAll(async () => {
    await leser.schliesse();
  });

  it.each([
    ['NEF', 'DSC_0412.NEF', () => nefBytes({ datum: '2019:06:14 10:15:00', bruchteil: '120' })],
    ['JPEG', 'IMG_0001.JPG', () => jpegBytes({ datum: '2019:06:14 10:15:00', bruchteil: '120' })],
    ['HEIC', 'IMG_0002.HEIC', () => heicBytes({ datum: '2019:06:14 10:15:00', bruchteil: '120' })],
  ])('liest die Aufnahmezeit aus %s', async (_art, name, bytes) => {
    const pfad = join(ordner, name);
    await schreibeDatei(pfad, bytes());

    const ergebnis = await leser.leseAufnahmezeit(pfad);

    expect(ergebnis.art).toBe('gelesen');
    if (ergebnis.art === 'gelesen') {
      expect(ergebnis.zeit).toEqual({
        jahr: 2019,
        monat: 6,
        tag: 14,
        stunde: 10,
        minute: 15,
        sekunde: 0,
      });
      expect(ergebnis.bruchteil).toBeCloseTo(0.12);
    }
  });

  it('meldet ein JPEG ohne EXIF als "keine Aufnahmezeit"', async () => {
    const pfad = join(ordner, 'ohne-zeit.jpg');
    await schreibeDatei(pfad, jpegBytes());

    expect((await leser.leseAufnahmezeit(pfad)).art).toBe('keineZeit');
  });

  it('meldet ein unvollstaendiges JPEG als beschaedigt', async () => {
    const pfad = join(ordner, 'kaputt.jpg');
    await schreibeDatei(pfad, kaputteJpegBytes());

    expect((await leser.leseAufnahmezeit(pfad)).art).toBe('beschaedigt');
  });
});
