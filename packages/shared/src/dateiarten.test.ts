import { describe, expect, it } from 'vitest';

import { dateiArt, endung, grundname, istFoto } from './dateiarten.js';

describe('dateiArt', () => {
  it('kennt NEF, JPEG und HEIC als Foto', () => {
    expect(dateiArt('DSC_0412.NEF')).toBe('raw');
    expect(dateiArt('DSC_0413.JPG')).toBe('jpeg');
    expect(dateiArt('urlaub.jpeg')).toBe('jpeg');
    expect(dateiArt('IMG_0001.HEIC')).toBe('heic');
    for (const name of ['DSC_0412.NEF', 'DSC_0413.JPG', 'IMG_0001.HEIC']) {
      expect(istFoto(dateiArt(name))).toBe(true);
    }
  });

  it('kennt xmp und acr als Sidecar', () => {
    expect(dateiArt('DSC_0412.xmp')).toBe('sidecar');
    expect(dateiArt('DSC_0412.ACR')).toBe('sidecar');
    expect(istFoto(dateiArt('DSC_0412.xmp'))).toBe(false);
  });

  it('ordnet Videos und alles andere ein', () => {
    expect(dateiArt('IMG_0001.MOV')).toBe('video');
    expect(dateiArt('film.mp4')).toBe('video');
    expect(dateiArt('notizen.txt')).toBe('anderes');
    expect(dateiArt('ohne-endung')).toBe('anderes');
  });
});

describe('Dateiname', () => {
  it('trennt Grundname und Endung, ohne die Endung zu veraendern', () => {
    expect(grundname('DSC_0412.NEF')).toBe('DSC_0412');
    expect(endung('DSC_0412.NEF')).toBe('.NEF');
    expect(endung('archiv.tar.gz')).toBe('.gz');
    expect(grundname('ohne-endung')).toBe('ohne-endung');
    expect(endung('ohne-endung')).toBe('');
    expect(endung('.versteckt')).toBe('');
  });
});
