import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { existiert, pruefsumme, type QuellenEinstellung } from '@knipsa/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { fuehreLaufAus, type ErgebnisEintrag, type LaufErgebnis } from './importlauf.js';
import { exiftoolLeser, type MetadatenLeser } from './metadaten.js';
import {
  jpegBytes,
  kaputteJpegBytes,
  nefBytes,
  schreibeDatei,
  xmpText,
} from './test/testbilder.js';

/**
 * Diese Tests laufen gegen echtes `exiftool` und echte Dateien in einem
 * temporaeren Verzeichnis — nie auf einem echten Foto-Baum (siehe
 * `delivery/stack.md`).
 */
let leser: MetadatenLeser;

beforeAll(() => {
  leser = exiftoolLeser();
});

afterAll(async () => {
  await leser.schliesse();
});

let wurzel: string;
let quelle: QuellenEinstellung;

beforeEach(async () => {
  const platz = await mkdtemp(join(tmpdir(), 'knipsa-import-'));
  wurzel = join(platz, 'fotos');
  quelle = { name: 'Test', pfad: join(platz, 'quelle') };
});

function lauf(): Promise<LaufErgebnis> {
  return fuehreLaufAus({ wurzel, quelle, leser });
}

function zu(ergebnis: LaufErgebnis, quellPfad: string): ErgebnisEintrag | undefined {
  return ergebnis.dateien.find((eintrag) => eintrag.quellPfad === quellPfad);
}

describe('ein Foto importieren', () => {
  beforeEach(async () => {
    await schreibeDatei(
      join(quelle.pfad, 'Toskana 2019', 'DSC_0412.NEF'),
      nefBytes({ datum: '2019:06:14 10:15:00' }),
    );
  });

  it('zeigt im Ergebnis Quellpfad und Ablage im Wartebereich', async () => {
    const ergebnis = await lauf();

    expect(zu(ergebnis, 'Toskana 2019/DSC_0412.NEF')).toEqual({
      art: 'neu',
      quellPfad: 'Toskana 2019/DSC_0412.NEF',
      schluessel: '20190614-101500a',
      ablage: '_wartend/2019-06/20190614-101500a.NEF',
    });
    expect(ergebnis.neu).toBe(1);
    expect(ergebnis.gesamt).toBe(1);
  });

  it('legt die Datei bytegleich im Wartebereich ab', async () => {
    await lauf();

    const ziel = join(wurzel, 'original', '_wartend', '2019-06', '20190614-101500a.NEF');
    expect(await pruefsumme(ziel)).toBe(
      await pruefsumme(join(quelle.pfad, 'Toskana 2019', 'DSC_0412.NEF')),
    );
  });

  it('laesst keine halbe Kopie in .import-teil zurueck', async () => {
    await lauf();

    expect(await existiert(join(wurzel, '.import-teil', '20190614-101500a.NEF'))).toBe(false);
  });

  it('schreibt ein Protokoll in den Foto-Baum', async () => {
    const ergebnis = await lauf();

    const protokoll = await readFile(join(wurzel, ergebnis.protokoll), 'utf8');
    expect(ergebnis.protokoll).toMatch(/^protokoll\/import\/\d{8}-\d{6}-Test\.log$/);
    expect(protokoll).toContain('Quelle:        Test');
    expect(protokoll).toContain(
      'Toskana 2019/DSC_0412.NEF -> _wartend/2019-06/20190614-101500a.NEF',
    );
  });

  it('vermerkt die Datei in der Gesehen-Liste', async () => {
    await lauf();

    const zeilen = (await readFile(join(wurzel, 'gesehen', 'gesehen.jsonl'), 'utf8'))
      .split('\n')
      .filter((zeile) => zeile !== '');
    expect(zeilen).toHaveLength(1);
    expect(JSON.parse(zeilen[0] as string)).toMatchObject({
      schluessel: '20190614-101500a',
      quelle: 'Test',
      ordner: 'Toskana 2019',
      dateiname: 'DSC_0412.NEF',
    });
  });
});

describe('Sidecar neben der NEF', () => {
  it('uebernimmt es unter demselben Schluessel', async () => {
    const ordner = join(quelle.pfad, 'Toskana 2019');
    await schreibeDatei(join(ordner, 'DSC_0412.NEF'), nefBytes({ datum: '2019:06:14 10:15:00' }));
    await schreibeDatei(join(ordner, 'DSC_0412.xmp'), xmpText(4));

    const ergebnis = await lauf();

    expect(zu(ergebnis, 'Toskana 2019/DSC_0412.xmp')).toEqual({
      art: 'neu',
      quellPfad: 'Toskana 2019/DSC_0412.xmp',
      schluessel: '20190614-101500a',
      ablage: '_wartend/2019-06/20190614-101500a.xmp',
    });
    expect(ergebnis.neu).toBe(2);
  });

  it('uebernimmt auch ein ACR-Sidecar', async () => {
    const ordner = join(quelle.pfad, 'Toskana 2019');
    await schreibeDatei(join(ordner, 'DSC_0412.NEF'), nefBytes({ datum: '2019:06:14 10:15:00' }));
    await schreibeDatei(join(ordner, 'DSC_0412.acr'), 'Einstellungen');

    const ergebnis = await lauf();

    expect(zu(ergebnis, 'Toskana 2019/DSC_0412.acr')?.ablage).toBe(
      '_wartend/2019-06/20190614-101500a.acr',
    );
  });
});

describe('Fotos derselben Sekunde', () => {
  it('bekommen die Buchstaben in Aufnahmereihenfolge', async () => {
    // Die Namen stehen bewusst anders als die Sekundenbruchteile — es
    // zaehlt der Bruchteil, nicht der Name.
    await schreibeDatei(
      join(quelle.pfad, 'serie', 'DSC_0501.NEF'),
      nefBytes({ datum: '2019:06:14 10:16:05', bruchteil: '300' }),
    );
    await schreibeDatei(
      join(quelle.pfad, 'serie', 'DSC_0502.NEF'),
      nefBytes({ datum: '2019:06:14 10:16:05', bruchteil: '100' }),
    );
    await schreibeDatei(
      join(quelle.pfad, 'serie', 'DSC_0503.NEF'),
      nefBytes({ datum: '2019:06:14 10:16:05', bruchteil: '200' }),
    );

    const ergebnis = await lauf();

    expect(zu(ergebnis, 'serie/DSC_0502.NEF')?.schluessel).toBe('20190614-101605a');
    expect(zu(ergebnis, 'serie/DSC_0503.NEF')?.schluessel).toBe('20190614-101605b');
    expect(zu(ergebnis, 'serie/DSC_0501.NEF')?.schluessel).toBe('20190614-101605c');
  });

  it('ordnet ohne Sekundenbruchteil nach dem urspruenglichen Dateinamen', async () => {
    // Gleiche Aufnahmezeit, kein Bruchteil: unterschiedlich gross, damit
    // es wirklich verschiedene Dateien sind.
    await schreibeDatei(
      join(quelle.pfad, 'DSC_0902.NEF'),
      nefBytes({ datum: '2019:06:14 10:16:05', fuellung: 2 }),
    );
    await schreibeDatei(
      join(quelle.pfad, 'DSC_0901.NEF'),
      nefBytes({ datum: '2019:06:14 10:16:05', fuellung: 5 }),
    );

    const ergebnis = await lauf();

    expect(zu(ergebnis, 'DSC_0901.NEF')?.schluessel).toBe('20190614-101605a');
    expect(zu(ergebnis, 'DSC_0902.NEF')?.schluessel).toBe('20190614-101605b');
  });
});

describe('Problemfaelle', () => {
  it('meldet ein JPEG ohne Aufnahmezeit mit dem Grund "keine Aufnahmezeit"', async () => {
    await schreibeDatei(join(quelle.pfad, 'handy', 'IMG_4711.JPG'), jpegBytes());

    const ergebnis = await lauf();

    expect(zu(ergebnis, 'handy/IMG_4711.JPG')).toEqual({
      art: 'problem',
      quellPfad: 'handy/IMG_4711.JPG',
      grund: 'keine Aufnahmezeit',
    });
    expect(ergebnis.problem).toBe(1);
    expect(ergebnis.neu).toBe(0);
  });

  it('meldet ein Sidecar ohne NEF mit dem Grund "Sidecar ohne Foto"', async () => {
    await schreibeDatei(join(quelle.pfad, 'Toskana 2019', 'DSC_0500.xmp'), xmpText(2));

    const ergebnis = await lauf();

    expect(zu(ergebnis, 'Toskana 2019/DSC_0500.xmp')).toEqual({
      art: 'problem',
      quellPfad: 'Toskana 2019/DSC_0500.xmp',
      grund: 'Sidecar ohne Foto',
    });
  });

  it('meldet eine beschaedigte Datei mit dem Grund "beschädigt"', async () => {
    await schreibeDatei(join(quelle.pfad, 'kaputt.jpg'), kaputteJpegBytes());

    const ergebnis = await lauf();

    expect(zu(ergebnis, 'kaputt.jpg')?.grund).toBe('beschädigt');
  });

  it('legt die Datei als Kopie mit Begruendung nach eingang/problem', async () => {
    await schreibeDatei(join(quelle.pfad, 'handy', 'IMG_4711.JPG'), jpegBytes());

    await lauf();

    const problem = join(wurzel, 'eingang', 'problem');
    expect((await readdir(problem)).sort()).toEqual(['IMG_4711.JPG', 'IMG_4711.JPG.grund.txt']);
    expect(await pruefsumme(join(problem, 'IMG_4711.JPG'))).toBe(
      await pruefsumme(join(quelle.pfad, 'handy', 'IMG_4711.JPG')),
    );
    const grund = await readFile(join(problem, 'IMG_4711.JPG.grund.txt'), 'utf8');
    expect(grund).toContain('Grund:     keine Aufnahmezeit');
    expect(grund).toContain('Ursprung:  handy/IMG_4711.JPG');
  });

  it('legt eine identische Datei dort nicht ein zweites Mal ab', async () => {
    await schreibeDatei(join(quelle.pfad, 'handy', 'IMG_4711.JPG'), jpegBytes());

    await lauf();
    const zweiter = await lauf();

    const problem = join(wurzel, 'eingang', 'problem');
    expect((await readdir(problem)).sort()).toEqual(['IMG_4711.JPG', 'IMG_4711.JPG.grund.txt']);
    // Gezaehlt wird der Problemfall weiter — nur kopiert wird er nicht erneut.
    expect(zweiter.problem).toBe(1);
  });

  it('legt eine andere Datei mit gleichem Namen daneben, statt sie zu ersetzen', async () => {
    await schreibeDatei(join(quelle.pfad, 'a', 'IMG_4711.JPG'), jpegBytes());
    await schreibeDatei(join(quelle.pfad, 'b', 'IMG_4711.JPG'), jpegBytes({ fuellung: 4 }));

    const ergebnis = await lauf();

    expect(ergebnis.problem).toBe(2);
    expect((await readdir(join(wurzel, 'eingang', 'problem'))).sort()).toEqual([
      'IMG_4711-2.JPG',
      'IMG_4711-2.JPG.grund.txt',
      'IMG_4711.JPG',
      'IMG_4711.JPG.grund.txt',
    ]);
  });

  it('nimmt einen Problemfall nicht in die Gesehen-Liste auf', async () => {
    await schreibeDatei(join(quelle.pfad, 'handy', 'IMG_4711.JPG'), jpegBytes());

    await lauf();

    expect(await existiert(join(wurzel, 'gesehen', 'gesehen.jsonl'))).toBe(false);
  });
});

describe('schon bekannte Dateien', () => {
  beforeEach(async () => {
    const ordner = join(quelle.pfad, 'Toskana 2019');
    await schreibeDatei(join(ordner, 'DSC_0412.NEF'), nefBytes({ datum: '2019:06:14 10:15:00' }));
    await schreibeDatei(join(ordner, 'DSC_0412.xmp'), xmpText(4));
    await schreibeDatei(join(ordner, 'DSC_0413.NEF'), nefBytes({ datum: '2019:06:14 10:15:02' }));
  });

  it('meldet beim zweiten Lauf 0 neu und alles als schon bekannt', async () => {
    const erster = await lauf();
    expect(erster.neu).toBe(3);

    const zweiter = await lauf();

    expect(zweiter.neu).toBe(0);
    expect(zweiter.bekannt).toBe(3);
    expect(zweiter.dateien.map((eintrag) => eintrag.art)).toEqual([
      'bekannt',
      'bekannt',
      'bekannt',
    ]);
    expect(zu(zweiter, 'Toskana 2019/DSC_0412.NEF')).toEqual({
      art: 'bekannt',
      quellPfad: 'Toskana 2019/DSC_0412.NEF',
      schluessel: '20190614-101500a',
    });
  });

  it('erkennt dieselbe Datei umbenannt in einem anderen Unterordner', async () => {
    await lauf();

    const original = join(quelle.pfad, 'Toskana 2019', 'DSC_0412.NEF');
    await schreibeDatei(join(quelle.pfad, 'sicherung', 'kopie.NEF'), await readFile(original));

    const zweiter = await lauf();

    expect(zu(zweiter, 'sicherung/kopie.NEF')).toEqual({
      art: 'bekannt',
      quellPfad: 'sicherung/kopie.NEF',
      schluessel: '20190614-101500a',
    });
    expect(zweiter.neu).toBe(0);
  });

  it('legt beim zweiten Lauf keine zweite Datei im Wartebereich ab', async () => {
    await lauf();
    await lauf();

    const monat = join(wurzel, 'original', '_wartend', '2019-06');
    expect((await readdir(monat)).sort()).toEqual([
      '20190614-101500a.NEF',
      '20190614-101500a.xmp',
      '20190614-101502a.NEF',
    ]);
  });
});

describe('schon vergebener Schluessel', () => {
  it('bekommt den naechsten freien Buchstaben', async () => {
    await schreibeDatei(
      join(quelle.pfad, 'erst', 'DSC_0412.NEF'),
      nefBytes({ datum: '2019:06:14 10:15:00' }),
    );
    const erster = await lauf();
    expect(zu(erster, 'erst/DSC_0412.NEF')?.schluessel).toBe('20190614-101500a');

    // Ein anderes Foto derselben Sekunde, in einem zweiten Lauf.
    await schreibeDatei(
      join(quelle.pfad, 'dann', 'DSC_0777.NEF'),
      nefBytes({ datum: '2019:06:14 10:15:00', fuellung: 3 }),
    );

    const zweiter = await lauf();

    expect(zu(zweiter, 'dann/DSC_0777.NEF')?.schluessel).toBe('20190614-101500b');
    expect(
      await existiert(join(wurzel, 'original', '_wartend', '2019-06', '20190614-101500b.NEF')),
    ).toBe(true);
  });
});
