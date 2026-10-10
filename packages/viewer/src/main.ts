import { starteSeite } from './seite.js';

// Nicht abgewartet: solange ein Import laeuft, haelt `starteSeite` den
// Bereich "Import" aktuell und kehrt erst danach zurueck.
void starteSeite(document, (url, optionen) => fetch(url, optionen));
