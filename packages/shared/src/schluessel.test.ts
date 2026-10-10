import { describe, expect, it } from 'vitest';

import {
  baueSchluessel,
  buchstabe,
  istSekundenTeil,
  monatsOrdner,
  platzVonBuchstabe,
  sekundenTeil,
  zerlegeSchluessel,
} from './schluessel.js';

describe('sekundenTeil', () => {
  it('baut JJJJMMTT-HHMMSS aus der Aufnahmezeit', () => {
    expect(
      sekundenTeil({ jahr: 2019, monat: 6, tag: 14, stunde: 10, minute: 15, sekunde: 0 }),
    ).toBe('20190614-101500');
  });

  it('rechnet nichts um und fuellt nur mit Nullen auf', () => {
    expect(sekundenTeil({ jahr: 2019, monat: 1, tag: 2, stunde: 3, minute: 4, sekunde: 5 })).toBe(
      '20190102-030405',
    );
  });
});

describe('buchstabe', () => {
  it('zaehlt a bis z', () => {
    expect(buchstabe(0)).toBe('a');
    expect(buchstabe(1)).toBe('b');
    expect(buchstabe(25)).toBe('z');
  });

  it('macht nach z mit za, zb weiter', () => {
    expect(buchstabe(26)).toBe('za');
    expect(buchstabe(27)).toBe('zb');
    expect(buchstabe(51)).toBe('zz');
    expect(buchstabe(52)).toBe('zza');
  });

  it('ist umkehrbar', () => {
    for (let platz = 0; platz < 60; platz += 1) {
      expect(platzVonBuchstabe(buchstabe(platz))).toBe(platz);
    }
  });

  it('weist eine ungueltige Angabe ab', () => {
    expect(() => buchstabe(-1)).toThrow();
    expect(platzVonBuchstabe('')).toBeUndefined();
    expect(platzVonBuchstabe('ab')).toBeUndefined();
    expect(platzVonBuchstabe('A')).toBeUndefined();
  });
});

describe('Schluessel', () => {
  it('setzt Sekundenteil und Buchstabe zusammen', () => {
    expect(baueSchluessel('20190614-101500', 0)).toBe('20190614-101500a');
    expect(baueSchluessel('20190614-101500', 1)).toBe('20190614-101500b');
  });

  it('zerlegt einen Schluessel wieder', () => {
    expect(zerlegeSchluessel('20190614-101605c')).toEqual({
      sekundenTeil: '20190614-101605',
      platz: 2,
    });
    expect(zerlegeSchluessel('20190614-101605za')).toEqual({
      sekundenTeil: '20190614-101605',
      platz: 26,
    });
  });

  it('erkennt, was kein Schluessel ist', () => {
    expect(zerlegeSchluessel('urlaub.jpg')).toBeUndefined();
    expect(zerlegeSchluessel('20190614-101605')).toBeUndefined();
    expect(zerlegeSchluessel('2019614-101605a')).toBeUndefined();
    expect(istSekundenTeil('20190614101605')).toBe(false);
  });

  it('nennt den Monatsordner zum Sekundenteil', () => {
    expect(monatsOrdner('20190614-101500')).toBe('2019-06');
  });
});
