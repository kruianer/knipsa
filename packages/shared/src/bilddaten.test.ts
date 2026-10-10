import { describe, expect, it } from 'vitest';

import { heicBilddaten, jpegBilddaten } from './bilddaten.js';

/** Ein JPEG-Abschnitt mit Marker und Laenge. */
function abschnitt(marker: number, inhalt: Buffer): Buffer {
  const laenge = inhalt.length + 2;
  return Buffer.concat([Buffer.from([0xff, marker, laenge >> 8, laenge & 0xff]), inhalt]);
}

/**
 * Ein JPEG aus den Abschnitten, die der Abgleich unterscheiden muss:
 * `APP1` (Metadaten), `DQT` (gehoert zum Bild), `SOS` und die
 * komprimierten Bilddaten.
 */
function jpeg({ meta = 'exif', bild = 'bild' }: { meta?: string; bild?: string } = {}): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    abschnitt(0xe1, Buffer.from(meta, 'ascii')),
    abschnitt(0xdb, Buffer.from('tabelle', 'ascii')),
    abschnitt(0xda, Buffer.from([0x01, 0x01, 0x00, 0x00, 0x3f, 0x00])),
    Buffer.from(bild, 'ascii'),
    Buffer.from([0xff, 0xd9]),
  ]);
}

describe('jpegBilddaten', () => {
  it('laesst die Metadaten-Abschnitte aussen vor', () => {
    const mitExif = jpegBilddaten(jpeg({ meta: 'exif' }));
    const mitAnderemExif = jpegBilddaten(jpeg({ meta: 'exif mit Bewertung' }));

    expect(mitExif).toEqual(mitAnderemExif);
    expect(mitExif?.toString('latin1')).not.toContain('exif');
  });

  it('nimmt die Bilddaten mit', () => {
    expect(jpegBilddaten(jpeg({ bild: 'bild' }))).not.toEqual(
      jpegBilddaten(jpeg({ bild: 'anderes Bild' })),
    );
    expect(jpegBilddaten(jpeg())?.toString('latin1')).toContain('bild');
    expect(jpegBilddaten(jpeg())?.toString('latin1')).toContain('tabelle');
  });

  it('weist ab, was kein JPEG ist', () => {
    expect(jpegBilddaten(Buffer.from('kein Bild'))).toBeUndefined();
    expect(jpegBilddaten(Buffer.alloc(0))).toBeUndefined();
    // Abgeschnitten mitten im Abschnitt.
    expect(jpegBilddaten(jpeg().subarray(0, 6))).toBeUndefined();
  });
});

function kasten(typ: string, ...teile: Buffer[]): Buffer {
  const inhalt = Buffer.concat(teile);
  const kopf = Buffer.alloc(8);
  kopf.writeUInt32BE(inhalt.length + 8, 0);
  kopf.write(typ, 4, 'ascii');
  return Buffer.concat([kopf, inhalt]);
}

function vollKasten(typ: string, version: number, ...teile: Buffer[]): Buffer {
  return kasten(typ, Buffer.from([version, 0, 0, 0]), ...teile);
}

/**
 * Ein HEIC mit Hauptbild und `Exif`-Element in `mdat`. Die Lage beider
 * Elemente steht in `iloc`; das Exif liegt hinter dem Bild, damit eine
 * laengere Bewertung nur seine Laenge veraendert.
 */
function heic({ bild = 'bild', exif = 'exif' }: { bild?: string; exif?: string } = {}): Buffer {
  const bildBytes = Buffer.from(bild, 'ascii');
  const exifBytes = Buffer.from(exif, 'ascii');

  function eintrag(kennung: number, offset: number, laenge: number): Buffer {
    const b = Buffer.alloc(14);
    b.writeUInt16BE(kennung, 0);
    b.writeUInt16BE(0, 2);
    b.writeUInt16BE(1, 4);
    b.writeUInt32BE(offset, 6);
    b.writeUInt32BE(laenge, 10);
    return b;
  }

  const ftyp = kasten('ftyp', Buffer.from('heic', 'ascii'), Buffer.alloc(4));
  const pitm = vollKasten('pitm', 0, Buffer.from([0, 1]));

  function baue(datenOffset: number): { datei: Buffer; datenOffset: number } {
    const iloc = vollKasten(
      'iloc',
      0,
      Buffer.from([0x44, 0x00, 0, 2]),
      eintrag(1, datenOffset, bildBytes.length),
      eintrag(2, datenOffset + bildBytes.length, exifBytes.length),
    );
    const meta = vollKasten('meta', 0, pitm, iloc);
    return {
      datei: Buffer.concat([ftyp, meta, kasten('mdat', bildBytes, exifBytes)]),
      datenOffset: ftyp.length + meta.length + 8,
    };
  }

  return baue(baue(0).datenOffset).datei;
}

describe('heicBilddaten', () => {
  it('nimmt nur die Bytes des Hauptbildes', () => {
    expect(heicBilddaten(heic())?.toString('ascii')).toBe('bild');
  });

  it('bleibt gleich, wenn sich nur das Exif-Element aendert', () => {
    expect(heicBilddaten(heic({ exif: 'exif' }))).toEqual(
      heicBilddaten(heic({ exif: 'exif mit Bewertung 5' })),
    );
  });

  it('aendert sich mit den Bilddaten', () => {
    expect(heicBilddaten(heic({ bild: 'bild' }))).not.toEqual(
      heicBilddaten(heic({ bild: 'anderes' })),
    );
  });

  it('weist ab, was kein HEIC ist', () => {
    expect(heicBilddaten(Buffer.from('kein Bild'))).toBeUndefined();
    expect(heicBilddaten(kasten('ftyp', Buffer.from('heic', 'ascii')))).toBeUndefined();
  });
});
