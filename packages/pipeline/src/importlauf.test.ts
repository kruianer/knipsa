import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { existiert, pruefsumme, type QuellenEinstellung } from '@knipsa/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  fuehreLaufAus,
  sammleDateien,
  type ErgebnisEintrag,
  type LaufErgebnis,
} from './importlauf.js';
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

describe('uebersprungene Dateien', () => {
  it('ueberspringt Video und JPEG neben gleichnamiger NEF mit ihrem Grund', async () => {
    const ordner = join(quelle.pfad, 'Toskana 2019');
    await schreibeDatei(join(ordner, 'DSC_0413.NEF'), nefBytes({ datum: '2019:06:14 10:15:02' }));
    await schreibeDatei(join(ordner, 'DSC_0413.JPG'), jpegBytes({ datum: '2019:06:14 10:15:02' }));
    await schreibeDatei(join(ordner, 'IMG_0001.MOV'), 'kein Foto');

    const ergebnis = await lauf();

    expect(zu(ergebnis, 'Toskana 2019/IMG_0001.MOV')).toEqual({
      art: 'uebersprungen',
      quellPfad: 'Toskana 2019/IMG_0001.MOV',
      grund: 'Video',
    });
    expect(zu(ergebnis, 'Toskana 2019/DSC_0413.JPG')).toEqual({
      art: 'uebersprungen',
      quellPfad: 'Toskana 2019/DSC_0413.JPG',
      grund: 'JPEG neben gleichnamiger NEF',
    });
    expect(ergebnis.uebersprungen).toBe(2);
    expect(ergebnis.neu).toBe(1);
  });

  it('kopiert eine uebersprungene Datei nirgendwohin', async () => {
    await schreibeDatei(join(quelle.pfad, 'film.MOV'), 'kein Foto');
    await schreibeDatei(join(quelle.pfad, 'notizen.txt'), 'Text');

    const ergebnis = await lauf();

    expect(zu(ergebnis, 'notizen.txt')?.grund).toBe('anderer Dateityp');
    expect(await existiert(join(wurzel, 'original'))).toBe(false);
    expect(await existiert(join(wurzel, 'eingang', 'problem'))).toBe(false);
  });

  it('uebernimmt ein JPEG ohne NEF daneben wie jedes andere Foto', async () => {
    await schreibeDatei(
      join(quelle.pfad, 'handy', 'IMG_0007.JPG'),
      jpegBytes({ datum: '2019:06:14 10:15:02' }),
    );

    const ergebnis = await lauf();

    expect(zu(ergebnis, 'handy/IMG_0007.JPG')?.ablage).toBe(
      '_wartend/2019-06/20190614-101502a.JPG',
    );
  });

  it('uebernimmt einen geaenderten Sidecar zu einem bekannten Foto nicht', async () => {
    const ordner = join(quelle.pfad, 'Toskana 2019');
    await schreibeDatei(join(ordner, 'DSC_0412.NEF'), nefBytes({ datum: '2019:06:14 10:15:00' }));
    await schreibeDatei(join(ordner, 'DSC_0412.xmp'), xmpText(3));
    await lauf();

    // In der Quelle liegt inzwischen eine andere Fassung des Sidecars.
    await schreibeDatei(join(ordner, 'DSC_0412.xmp'), xmpText(5));

    const zweiter = await lauf();

    expect(zu(zweiter, 'Toskana 2019/DSC_0412.xmp')).toEqual({
      art: 'uebersprungen',
      quellPfad: 'Toskana 2019/DSC_0412.xmp',
      grund: 'Sidecar zu bekanntem Foto nicht übernommen',
    });
    expect(zu(zweiter, 'Toskana 2019/DSC_0412.NEF')?.art).toBe('bekannt');
    // Der Sidecar im Baum bleibt die zuerst importierte Fassung.
    expect(
      await readFile(
        join(wurzel, 'original', '_wartend', '2019-06', '20190614-101500a.xmp'),
        'utf8',
      ),
    ).toBe(xmpText(3));
  });

  it('ordnet jede Datei der Quelle genau einmal ein', async () => {
    const ordner = join(quelle.pfad, 'bunt');
    await schreibeDatei(join(ordner, 'DSC_0413.NEF'), nefBytes({ datum: '2019:06:14 10:15:02' }));
    await schreibeDatei(join(ordner, 'DSC_0413.xmp'), xmpText(3));
    await schreibeDatei(join(ordner, 'DSC_0413.JPG'), jpegBytes({ datum: '2019:06:14 10:15:02' }));
    await schreibeDatei(join(ordner, 'DSC_0500.xmp'), xmpText(1));
    await schreibeDatei(join(ordner, 'IMG_0001.MOV'), 'kein Foto');
    await schreibeDatei(join(ordner, 'notizen.txt'), 'Text');
    await schreibeDatei(join(ordner, 'ohne-zeit.jpg'), jpegBytes());
    await schreibeDatei(join(ordner, 'kaputt.jpg'), kaputteJpegBytes());

    const ergebnis = await lauf();

    expect(ergebnis.gesamt).toBe(8);
    expect(ergebnis.dateien).toHaveLength(8);
    expect(ergebnis.neu + ergebnis.bekannt + ergebnis.uebersprungen + ergebnis.problem).toBe(8);
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

describe('die Quelle bleibt unangetastet', () => {
  /** Jede Datei der Quelle mit Groesse, Pruefsumme und Aenderungszeit. */
  async function abbild(ordner: string): Promise<Record<string, string>> {
    const abzug: Record<string, string> = {};
    for (const datei of await sammleDateien(ordner)) {
      const angaben = await stat(datei.pfad);
      abzug[datei.quellPfad] = `${angaben.size} ${angaben.mtimeMs} ${await pruefsumme(datei.pfad)}`;
    }
    return abzug;
  }

  /** Eine Quelle mit allen Faellen: neu, Sidecar, uebersprungen, Problem. */
  async function bunteQuelle(): Promise<void> {
    const ordner = join(quelle.pfad, 'Toskana 2019');
    await schreibeDatei(join(ordner, 'DSC_0412.NEF'), nefBytes({ datum: '2019:06:14 10:15:00' }));
    await schreibeDatei(join(ordner, 'DSC_0412.xmp'), xmpText(4));
    await schreibeDatei(join(ordner, 'DSC_0413.NEF'), nefBytes({ datum: '2019:06:14 10:15:02' }));
    await schreibeDatei(join(ordner, 'DSC_0413.JPG'), jpegBytes({ datum: '2019:06:14 10:15:02' }));
    await schreibeDatei(join(ordner, 'DSC_0500.xmp'), xmpText(1));
    await schreibeDatei(join(ordner, 'IMG_0001.MOV'), 'kein Foto');
    await schreibeDatei(join(ordner, 'ohne-zeit.jpg'), jpegBytes());
    await schreibeDatei(join(ordner, 'notizen.txt'), 'Text');
  }

  it('loescht, benennt und veraendert dort nichts', async () => {
    await bunteQuelle();
    const vorher = await abbild(quelle.pfad);

    const ergebnis = await lauf();

    expect(ergebnis.neu).toBeGreaterThan(0);
    expect(await abbild(quelle.pfad)).toEqual(vorher);
  });

  it('laesst sie auch beim zweiten Lauf unveraendert', async () => {
    await bunteQuelle();
    await lauf();
    const vorher = await abbild(quelle.pfad);

    await lauf();

    expect(await abbild(quelle.pfad)).toEqual(vorher);
  });

  it('legt in der Quelle auch nichts Neues an', async () => {
    await bunteQuelle();
    const vorher = Object.keys(await abbild(quelle.pfad));

    await lauf();

    expect(Object.keys(await abbild(quelle.pfad))).toEqual(vorher);
  });
});

describe('Neustart mitten in einem Lauf', () => {
  /** Drei Fotos; das zweite laesst den Lauf scheitern. */
  async function dreiFotos(): Promise<void> {
    await schreibeDatei(
      join(quelle.pfad, 'reise', 'DSC_0001.NEF'),
      nefBytes({ datum: '2019:06:14 10:15:00' }),
    );
    await schreibeDatei(
      join(quelle.pfad, 'reise', 'DSC_0002.NEF'),
      nefBytes({ datum: '2019:06:14 10:15:01' }),
    );
    await schreibeDatei(
      join(quelle.pfad, 'reise', 'DSC_0003.NEF'),
      nefBytes({ datum: '2019:06:14 10:15:02' }),
    );
  }

  /** Leser, der bei der genannten Datei abbricht — wie ein Absturz. */
  function brechenderLeser(bei: string): MetadatenLeser {
    return {
      leseAufnahmezeit: (pfad) =>
        pfad.endsWith(bei) ? Promise.reject(new Error('Server weg')) : leser.leseAufnahmezeit(pfad),
      schliesse: () => Promise.resolve(),
    };
  }

  it('hat danach jedes Foto genau einmal mit je einem Schluessel', async () => {
    await dreiFotos();

    await expect(
      fuehreLaufAus({ wurzel, quelle, leser: brechenderLeser('DSC_0002.NEF') }),
    ).rejects.toThrow('Server weg');

    const nachher = await lauf();

    // Jede Datei genau einmal, jeder Schluessel genau einmal.
    const schluessel = nachher.dateien.map((eintrag) => eintrag.schluessel);
    expect(nachher.dateien.map((eintrag) => eintrag.quellPfad)).toEqual([
      'reise/DSC_0001.NEF',
      'reise/DSC_0002.NEF',
      'reise/DSC_0003.NEF',
    ]);
    expect(new Set(schluessel).size).toBe(3);
    expect((await readdir(join(wurzel, 'original', '_wartend', '2019-06'))).sort()).toEqual([
      '20190614-101500a.NEF',
      '20190614-101501a.NEF',
      '20190614-101502a.NEF',
    ]);
  });

  it('laesst keine halb kopierte Datei im Wartebereich liegen', async () => {
    await dreiFotos();
    await expect(
      fuehreLaufAus({ wurzel, quelle, leser: brechenderLeser('DSC_0002.NEF') }),
    ).rejects.toThrow();

    // Ein Absturz nach dem Kopieren, aber vor dem Vermerk.
    await schreibeDatei(join(wurzel, '.import-teil', '20190614-101509a.NEF'), 'halbe Datei');

    await lauf();

    expect(await readdir(join(wurzel, '.import-teil'))).toEqual([]);
    for (const name of await readdir(join(wurzel, 'original', '_wartend', '2019-06'))) {
      expect(name).not.toContain('20190614-101509a');
    }
  });

  it('holt einen vermerkten, aber nicht umbenannten Schluessel nach', async () => {
    await dreiFotos();
    const erster = await lauf();
    expect(erster.neu).toBe(3);

    // Ein Absturz genau zwischen Vermerk und Umbenennen: die Datei liegt
    // wieder in .import-teil, der Vermerk ist schon da.
    const imBaum = join(wurzel, 'original', '_wartend', '2019-06', '20190614-101501a.NEF');
    await schreibeDatei(
      join(wurzel, '.import-teil', '20190614-101501a.NEF'),
      await readFile(imBaum),
    );
    await rm(imBaum);

    const zweiter = await lauf();

    expect(await existiert(imBaum)).toBe(true);
    expect(await readdir(join(wurzel, '.import-teil'))).toEqual([]);
    expect(zweiter.neu).toBe(0);
    expect(zweiter.bekannt).toBe(3);
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
