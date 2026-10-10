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
  };
}
