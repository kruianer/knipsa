import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  deuteAngaben,
  deuteTags,
  exiftoolLeser,
  zerlegeZeitangabe,
  type AngabenLeser,
  type MetadatenLeser,
} from './metadaten.js';
import {
  heicBytes,
  jpegBytes,
  kaputteJpegBytes,
  nefBytes,
  schreibeDatei,
  xmpText,
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

describe('deuteAngaben', () => {
  it('liest Bewertung, Farbmarkierung, Stichwoerter, Titel und Beschreibung', () => {
    expect(
      deuteAngaben({
        Rating: 4,
        Label: 'Rot',
        Subject: ['Toskana', 'Urlaub'],
        Title: 'Zypressen',
        Description: 'Allee bei Pienza',
      }),
    ).toEqual({
      bewertung: 4,
      farbmarkierung: 'Rot',
      stichwoerter: ['Toskana', 'Urlaub'],
      titel: 'Zypressen',
      beschreibung: 'Allee bei Pienza',
      gpsBreite: undefined,
      gpsLaenge: undefined,
    });
  });

  it('nimmt eine Bewertung von 0 als "nicht bewertet"', () => {
    expect(deuteAngaben({ Rating: 0 }).bewertung).toBeUndefined();
    expect(deuteAngaben({}).bewertung).toBeUndefined();
  });

  it('fasst Stichwoerter aus Subject und Keywords ohne Doppelte zusammen', () => {
    expect(
      deuteAngaben({ Subject: 'Toskana', Keywords: ['Toskana', 'Urlaub'] }).stichwoerter,
    ).toEqual(['Toskana', 'Urlaub']);
  });

  it('nimmt fuer Titel und Beschreibung das erste gefuellte Feld', () => {
    expect(deuteAngaben({ ObjectName: 'aus IPTC' }).titel).toBe('aus IPTC');
    expect(deuteAngaben({ Title: 'aus XMP', ObjectName: 'aus IPTC' }).titel).toBe('aus XMP');
    expect(deuteAngaben({ ImageDescription: 'aus EXIF' }).beschreibung).toBe('aus EXIF');
    expect(deuteAngaben({ 'Caption-Abstract': 'aus IPTC' }).beschreibung).toBe('aus IPTC');
  });

  it('macht Sueden und Westen zu negativen Koordinaten', () => {
    expect(
      deuteAngaben({
        GPSLatitude: 33.86,
        GPSLatitudeRef: 'S',
        GPSLongitude: 151.21,
        GPSLongitudeRef: 'E',
      }),
    ).toMatchObject({ gpsBreite: -33.86, gpsLaenge: 151.21 });
  });

  it('laesst ein schon vorzeichenbehaftetes Feld, wie es ist', () => {
    expect(deuteAngaben({ GPSLatitude: -33.86, GPSLatitudeRef: 'S' }).gpsBreite).toBe(-33.86);
  });

  it('uebergeht Felder, die keine Zahl oder leer sind', () => {
    expect(deuteAngaben({ Rating: 'keine', GPSLatitude: '', Label: '  ' })).toEqual({
      bewertung: undefined,
      farbmarkierung: undefined,
      stichwoerter: [],
      titel: undefined,
      beschreibung: undefined,
      gpsBreite: undefined,
      gpsLaenge: undefined,
    });
  });
});

/** Diese Tests lesen mit echtem `exiftool` aus echten Dateien. */
describe('exiftoolLeser', () => {
  let leser: MetadatenLeser & AngabenLeser;
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

  it('liest Bewertung, Farbmarkierung und Stichwoerter aus einem XMP-Sidecar', async () => {
    const pfad = join(ordner, '20190614-101500a.xmp');
    await schreibeDatei(pfad, xmpText(4, { stichwoerter: ['Toskana'], farbe: 'Rot' }));

    const angaben = await leser.leseAngaben(pfad);

    expect(angaben.bewertung).toBe(4);
    expect(angaben.farbmarkierung).toBe('Rot');
    expect(angaben.stichwoerter).toEqual(['Toskana']);
  });

  it('liest die geaenderte Bewertung aus derselben XMP wieder', async () => {
    const pfad = join(ordner, '20190614-101501a.xmp');
    await schreibeDatei(pfad, xmpText(4));
    await schreibeDatei(pfad, xmpText(5));

    expect((await leser.leseAngaben(pfad)).bewertung).toBe(5);
  });

  it('liest aus einem Foto ohne Angaben nichts hinzu', async () => {
    const pfad = join(ordner, 'ohne-angaben.jpg');
    await schreibeDatei(pfad, jpegBytes({ datum: '2019:06:14 10:15:00' }));

    const angaben = await leser.leseAngaben(pfad);

    expect(angaben.bewertung).toBeUndefined();
    expect(angaben.stichwoerter).toEqual([]);
  });
});
