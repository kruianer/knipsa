/**
 * Konfiguration aus Umgebungsvariablen.
 *
 * Werte stehen ausschliesslich in den env-Dateien auf dem Host
 * (`~/knipsa-env/dev.env`, `~/knipsa-env/prod.env`) bzw. in der
 * Compose-Datei; im Repo stehen nur die Variablennamen
 * (siehe `deploy/example.env`). Fehlermeldungen nennen nie einen Wert,
 * nur den Namen der Variable — damit nichts Geheimes im Log landet.
 */

export const UMGEBUNGEN = ['dev', 'prod'] as const;

export type Umgebung = (typeof UMGEBUNGEN)[number];

/** Eine eingestellte Import-Quelle: ein Ordner mit Name (req-005). */
export interface QuellenEinstellung {
  readonly name: string;
  readonly pfad: string;
}

export interface Konfiguration {
  /** `dev` oder `prod`, aus `KNIPSA_ENV`. */
  readonly umgebung: Umgebung;
  /** Oeffentliche Adresse der App, aus `APP_ORIGIN`. */
  readonly appOrigin: string;
  /** Postgres-Verbindung, aus `DATABASE_URL`. */
  readonly databaseUrl: string;
  /** Wurzel des Foto-Baums im Container, aus `FOTOS_PFAD` (dort `/fotos`). */
  readonly fotosPfad: string;
  /** Adresse, auf der der Server im Container lauscht, aus `SERVER_HOST`. */
  readonly serverHost: string;
  /** Port, auf dem der Server im Container lauscht, aus `SERVER_PORT`. */
  readonly serverPort: number;
  /**
   * Ordner, aus denen importiert wird, aus `IMPORT_QUELLEN`. Ohne Angabe
   * leer — dann zeigt die Seite "Import" keine Quelle an.
   */
  readonly importQuellen: readonly QuellenEinstellung[];
  /**
   * Ordner, unter dem eingesteckte Datentraeger eingehaengt erscheinen,
   * aus `DATENTRAEGER_PFAD` (im Container `/datentraeger`, req-006). Ohne
   * Angabe leer — dann zeigt die Seite "Import" keinen Datentraeger an.
   */
  readonly datentraegerPfad: string;
}

/** Eine Umgebungsvariable fehlt oder hat einen unbrauchbaren Wert. */
export class KonfigurationsFehler extends Error {
  constructor(
    readonly variable: string,
    grund: string,
  ) {
    super(`Umgebungsvariable ${variable}: ${grund}`);
    this.name = 'KonfigurationsFehler';
  }
}

export type UmgebungsVariablen = Readonly<Record<string, string | undefined>>;

function pflichtText(env: UmgebungsVariablen, variable: string): string {
  const wert = env[variable]?.trim();
  if (wert === undefined || wert === '') {
    throw new KonfigurationsFehler(variable, 'fehlt');
  }
  return wert;
}

function istUmgebung(wert: string): wert is Umgebung {
  return (UMGEBUNGEN as readonly string[]).includes(wert);
}

function pflichtPort(env: UmgebungsVariablen, variable: string): number {
  const text = pflichtText(env, variable);
  const port = Number(text);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new KonfigurationsFehler(variable, 'kein Port zwischen 1 und 65535');
  }
  return port;
}

/**
 * Liest die Quellen-Liste aus `IMPORT_QUELLEN`. Form: `Name=Pfad`, mehrere
 * durch `;` getrennt, zum Beispiel `Test=/quellen/test`. Leer oder nicht
 * gesetzt bedeutet: keine Quelle eingestellt.
 */
function quellen(env: UmgebungsVariablen, variable: string): QuellenEinstellung[] {
  const text = env[variable]?.trim();
  if (text === undefined || text === '') {
    return [];
  }

  const eintraege = text
    .split(';')
    .map((eintrag) => eintrag.trim())
    .filter((eintrag) => eintrag !== '');

  const gelesen = eintraege.map((eintrag) => {
    const trenner = eintrag.indexOf('=');
    const name = trenner < 0 ? '' : eintrag.slice(0, trenner).trim();
    const pfad = trenner < 0 ? '' : eintrag.slice(trenner + 1).trim();

    if (name === '' || pfad === '') {
      throw new KonfigurationsFehler(
        variable,
        'erwartet Eintraege der Form Name=Pfad, getrennt mit ;',
      );
    }
    if (!pfad.startsWith('/')) {
      throw new KonfigurationsFehler(variable, 'jeder Pfad muss absolut sein');
    }

    return { name, pfad };
  });

  const namen = new Set(gelesen.map((quelle) => quelle.name));
  if (namen.size !== gelesen.length) {
    throw new KonfigurationsFehler(variable, 'jeder Quellen-Name darf nur einmal vorkommen');
  }

  return gelesen;
}

/**
 * Liest einen Pfad, der nicht gesetzt sein muss. Ist er gesetzt, muss er
 * absolut sein — ein relativer Pfad zeigt im Container irgendwohin.
 */
function freiwilligerPfad(env: UmgebungsVariablen, variable: string): string {
  const pfad = env[variable]?.trim();
  if (pfad === undefined || pfad === '') {
    return '';
  }
  if (!pfad.startsWith('/')) {
    throw new KonfigurationsFehler(variable, 'muss ein absoluter Pfad sein');
  }

  return pfad;
}

/**
 * Liest die Konfiguration und prueft sie vollstaendig. Fehlt etwas, wird
 * sofort geworfen — der Server startet dann nicht mit halber Konfiguration.
 */
export function leseKonfiguration(env: UmgebungsVariablen = process.env): Konfiguration {
  const umgebung = pflichtText(env, 'KNIPSA_ENV');
  if (!istUmgebung(umgebung)) {
    throw new KonfigurationsFehler('KNIPSA_ENV', `erwartet ${UMGEBUNGEN.join(' oder ')}`);
  }

  return {
    umgebung,
    appOrigin: pflichtText(env, 'APP_ORIGIN'),
    databaseUrl: pflichtText(env, 'DATABASE_URL'),
    fotosPfad: pflichtText(env, 'FOTOS_PFAD'),
    serverHost: pflichtText(env, 'SERVER_HOST'),
    serverPort: pflichtPort(env, 'SERVER_PORT'),
    importQuellen: quellen(env, 'IMPORT_QUELLEN'),
    datentraegerPfad: freiwilligerPfad(env, 'DATENTRAEGER_PFAD'),
  };
}
