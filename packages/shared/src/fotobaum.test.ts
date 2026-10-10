import { describe, expect, it } from 'vitest';

import {
  gesehenDatei,
  laeufeDatei,
  problemVerzeichnis,
  protokollVerzeichnis,
  teilVerzeichnis,
  wartendAnzeige,
  wartendPfad,
} from './fotobaum.js';

const WURZEL = '/fotos';

describe('Ablage im Wartebereich', () => {
  it('legt ein Foto unter original/_wartend/JJJJ-MM ab', () => {
    expect(wartendPfad(WURZEL, '20190614-101500a', '.NEF')).toBe(
      '/fotos/original/_wartend/2019-06/20190614-101500a.NEF',
    );
  });

  it('laesst die Endung unveraendert', () => {
    expect(wartendPfad(WURZEL, '20190614-101500a', '.xmp')).toBe(
      '/fotos/original/_wartend/2019-06/20190614-101500a.xmp',
    );
    expect(wartendPfad(WURZEL, '20190614-101500a', '.JPG')).toBe(
      '/fotos/original/_wartend/2019-06/20190614-101500a.JPG',
    );
  });

  it('zeigt den Pfad ab _wartend an', () => {
    expect(wartendAnzeige('20190614-101500a', '.NEF')).toBe(
      '_wartend/2019-06/20190614-101500a.NEF',
    );
  });

  it('weist einen Schluessel ohne Form ab', () => {
    expect(() => wartendPfad(WURZEL, 'urlaub', '.jpg')).toThrow();
    expect(() => wartendAnzeige('urlaub', '.jpg')).toThrow();
  });
});

describe('weitere Orte im Foto-Baum', () => {
  it('nennt sie alle unterhalb der Wurzel', () => {
    expect(problemVerzeichnis(WURZEL)).toBe('/fotos/eingang/problem');
    expect(gesehenDatei(WURZEL)).toBe('/fotos/gesehen/gesehen.jsonl');
    expect(protokollVerzeichnis(WURZEL)).toBe('/fotos/protokoll/import');
    expect(laeufeDatei(WURZEL)).toBe('/fotos/zustand/import-laeufe.json');
    expect(teilVerzeichnis(WURZEL)).toBe('/fotos/.import-teil');
  });
});
