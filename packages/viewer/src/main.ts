import { starteSeite } from './seite.js';

await starteSeite(document, (url) => fetch(url));
