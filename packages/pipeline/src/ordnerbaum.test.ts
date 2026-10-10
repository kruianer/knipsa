import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { ordnerPfad, pruefeOrdner, UnbekannterOrdner, zeigeOrdner } from './ordnerbaum.js';

let karte: string;

/** Eine Karte mit zwei Kamera-Ordnern und einer Datei in der Wurzel. */
beforeEach(async () => {
  karte = await mkdtemp(join(tmpdir(), 'knipsa-karte-'));

  await mkdir(join(karte, 'DCIM', '100NIKON'), { recursive: true });
  await mkdir(join(karte, 'DCIM', '101NIKON'), { recursive: true });
  await writeFile(join(karte, 'DCIM', '100NIKON', 'DSC_0001.NEF'), 'eins');
  await writeFile(join(karte, 'DCIM', '100NIKON', 'DSC_0002.NEF'), 'zwei');
  await writeFile(join(karte, 'DCIM', '101NIKON', 'DSC_0003.NEF'), 'drei');
  await writeFile(join(karte, 'hinweis.txt'), 'kein Foto');
});

describe('zeigeOrdner', () => {
  it('zeigt in der Wurzel die Ordner der Karte mit Anzahl Dateien', async () => {
    expect(await zeigeOrdner(karte)).toEqual({
      ordner: '',
      dateien: 4,
      unterordner: [{ name: 'DCIM', pfad: 'DCIM', dateien: 3, weiter: true }],
    });
  });

  it('zeigt die naechste Ebene mit den Kamera-Ordnern', async () => {
    expect(await zeigeOrdner(karte, 'DCIM')).toEqual({
      ordner: 'DCIM',
      dateien: 3,
      unterordner: [
        { name: '100NIKON', pfad: 'DCIM/100NIKON', dateien: 2, weiter: false },
        { name: '101NIKON', pfad: 'DCIM/101NIKON', dateien: 1, weiter: false },
      ],
    });
  });

  it('zaehlt die Dateien eines Ordners samt Unterordnern', async () => {
    await mkdir(join(karte, 'DCIM', '101NIKON', 'alt'));
    await writeFile(join(karte, 'DCIM', '101NIKON', 'alt', 'DSC_0004.NEF'), 'vier');

    const ansicht = await zeigeOrdner(karte, 'DCIM');
    expect(ansicht.unterordner[1]).toEqual({
      name: '101NIKON',
      pfad: 'DCIM/101NIKON',
      dateien: 2,
      weiter: true,
    });
  });

  it('meldet einen Ordner ohne Unterordner als leere Ebene', async () => {
    expect(await zeigeOrdner(karte, 'DCIM/101NIKON')).toEqual({
      ordner: 'DCIM/101NIKON',
      dateien: 1,
      unterordner: [],
    });
  });

  it('wirft fuer einen Ordner, den es nicht gibt', async () => {
    await expect(zeigeOrdner(karte, 'DCIM/999NIKON')).rejects.toThrow(UnbekannterOrdner);
  });
});

describe('Ordner von aussen', () => {
  it('nimmt nur relative Pfade ohne . und ..', () => {
    expect(pruefeOrdner('')).toBe('');
    expect(pruefeOrdner('DCIM/101NIKON')).toBe('DCIM/101NIKON');
    expect(pruefeOrdner('./DCIM/')).toBe('DCIM');
    expect(() => pruefeOrdner('../geheim')).toThrow(UnbekannterOrdner);
    expect(() => pruefeOrdner('DCIM/../..')).toThrow(UnbekannterOrdner);
    expect(() => pruefeOrdner('/etc')).toThrow(UnbekannterOrdner);
  });

  it('weist einen Verweis ab, der aus der Quelle hinausfuehrt', async () => {
    // Eine Fremdquelle darf nicht als Schluessel zum ganzen Dateisystem
    // dienen — auch nicht ueber einen Verweis auf der Karte selbst.
    const daneben = await mkdtemp(join(tmpdir(), 'knipsa-daneben-'));
    await symlink(daneben, join(karte, 'woanders'));

    await expect(ordnerPfad(karte, 'woanders')).rejects.toThrow(UnbekannterOrdner);
    await expect(zeigeOrdner(karte, 'woanders')).rejects.toThrow(UnbekannterOrdner);
  });

  it('gibt den Pfad eines Ordners in der Quelle zurueck', async () => {
    expect(await ordnerPfad(karte, 'DCIM/101NIKON')).toBe(join(karte, 'DCIM', '101NIKON'));
    expect(await ordnerPfad(karte, '')).toBe(karte);
  });
});
