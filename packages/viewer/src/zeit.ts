/** Zeiten und Dauern, wie die Seite sie zeigt. */

/** Zeitpunkt in der Schreibweise des Browsers. */
export function zeitText(iso: string): string {
  const zeit = new Date(iso);
  return Number.isNaN(zeit.getTime()) ? iso : zeit.toLocaleString('de-DE');
}

function einheit(anzahl: number, einzahl: string, mehrzahl: string): string {
  return anzahl === 1 ? `1 ${einzahl}` : `${anzahl} ${mehrzahl}`;
}

/**
 * Dauer eines Laufs in Worten: "unter 1 Sekunde", "12 Sekunden",
 * "1 Minute 5 Sekunden".
 */
export function dauerText(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    return 'unbekannt';
  }
  if (ms < 1000) {
    return 'unter 1 Sekunde';
  }

  const sekunden = Math.round(ms / 1000);
  if (sekunden < 60) {
    return einheit(sekunden, 'Sekunde', 'Sekunden');
  }

  const minuten = Math.floor(sekunden / 60);
  const rest = sekunden % 60;
  const minutenText = einheit(minuten, 'Minute', 'Minuten');

  return rest === 0 ? minutenText : `${minutenText} ${einheit(rest, 'Sekunde', 'Sekunden')}`;
}
