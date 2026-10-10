/**
 * Mandanten.
 *
 * Jede Fachtabelle hat `mandant_id`, und jede Abfrage filtert danach
 * (siehe `delivery/stack.md`). Bis zur Anmeldung (req-002) gibt es genau
 * einen Mandanten, den eine Migration anlegt; die Ersteinrichtung in
 * req-002 macht den Betreiber zu dessen Besitzer.
 */

/**
 * Der einzige Mandant, solange es keine Anmeldung gibt. Denselben Wert
 * legt die Migration `0002_archiv` an — sie fuehrt ihn bewusst selbst,
 * damit eine ausgefuehrte Migration unveraendert bleibt.
 */
export const STANDARD_MANDANT = 'standard';
