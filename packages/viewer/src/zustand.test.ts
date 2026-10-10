import { describe, expect, it } from 'vitest';

import { ampelFarbe, ampelText } from './zustand.js';

describe('ampelFarbe', () => {
  it('ist gruen, wenn Datenbank und Fotos ok sind', () => {
    expect(ampelFarbe({ erreichbar: true, datenbank: 'ok', fotos: 'ok' })).toBe('gruen');
  });

  it('ist rot, sobald eine Pruefung fehlschlaegt', () => {
    expect(ampelFarbe({ erreichbar: true, datenbank: 'fehler', fotos: 'ok' })).toBe('rot');
    expect(ampelFarbe({ erreichbar: true, datenbank: 'ok', fotos: 'fehler' })).toBe('rot');
    expect(ampelFarbe({ erreichbar: true, datenbank: 'fehler', fotos: 'fehler' })).toBe('rot');
  });

  it('ist gelb, wenn der Server nicht geantwortet hat', () => {
    expect(ampelFarbe({ erreichbar: false })).toBe('gelb');
  });

  it('ist rot, wenn die Antwort unvollstaendig ist', () => {
    expect(ampelFarbe({ erreichbar: true })).toBe('rot');
  });
});

describe('ampelText', () => {
  it('beschreibt jede Farbe', () => {
    expect(ampelText('gruen')).toBe('bereit');
    expect(ampelText('rot')).toBe('nicht bereit');
    expect(ampelText('gelb')).toBe('keine Antwort');
  });
});
