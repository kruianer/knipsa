/**
 * Prueft die Regeln des Stylesheets, von denen die Bedienung abhaengt.
 *
 * Die Testumgebung rechnet kein Layout aus (happy-dom kennt keine
 * Breiten), geprueft wird darum die Regel selbst. Nachgemessen wurde im
 * Browser: eine Quellen-Zeile mit Datentraeger braucht 480 px: ohne
 * Umbruch steht "Ordner wählen …" auf dem iPhone (390 px im Hochformat)
 * ausserhalb des Bildes und ist weder zu sehen noch zu druecken
 * (bug-001). Der Laptop (60rem) zeigt sie weiter in einer Zeile.
 */

import { describe, expect, it } from 'vitest';

import stil from './stil.css?raw';

const ohneKommentare = stil.replace(/\/\*[\s\S]*?\*\//g, '');

/** Die Angaben einer Regel, zum Beispiel `.quelle`. */
function angaben(selektor: string): Map<string, string> {
  const muster = new RegExp(`(?:^|[};])\\s*${selektor.replace(/\./g, '\\.')}\\s*\\{([^}]*)\\}`);
  const block = muster.exec(ohneKommentare)?.[1];
  if (block === undefined) {
    throw new Error(`Regel ${selektor} fehlt im Stylesheet`);
  }

  return new Map(
    block
      .split(';')
      .map((zeile) => zeile.trim())
      .filter((zeile) => zeile !== '')
      .map((zeile) => {
        const teiler = zeile.indexOf(':');
        return [zeile.slice(0, teiler).trim(), zeile.slice(teiler + 1).trim()];
      }),
  );
}

describe('Quellen-Zeile', () => {
  it('bricht um, damit kein Knopf aus dem Bild rutscht', () => {
    const quelle = angaben('.quelle');

    expect(quelle.get('display')).toBe('flex');
    expect(quelle.get('flex-wrap')).toBe('wrap');
  });

  it('laesst den Namen auf schmalen Bildschirmen schrumpfen', () => {
    // Eine feste Mindestbreite nimmt den Knoepfen den Platz, den sie auf
    // dem iPhone brauchen.
    expect(angaben('.quelle-name').get('min-width')).toContain('100%');
  });
});
