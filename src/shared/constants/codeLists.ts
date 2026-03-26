/** UNTDID 1001 — Rechnungsarten */
export const INVOICE_TYPE_CODES: Record<string, string> = {
  '380': 'Rechnung',
  '381': 'Gutschrift',
  '384': 'Korrekturrechnung',
  '389': 'Eigenrechnung',
  '751': 'Rechnungsinformation',
};

/** ISO 4217 — Währungen */
export const CURRENCY_CODES: Record<string, string> = {
  'EUR': 'Euro',
  'USD': 'US-Dollar',
  'GBP': 'Britisches Pfund',
  'CHF': 'Schweizer Franken',
};

/** Währungssymbole für ISO 4217 Codes.
 * CHF hat kein offizielles Symbol — wird als Abkürzung "CHF" angezeigt. */
export const CURRENCY_SYMBOLS: Record<string, string> = {
  'EUR': '€',
  'USD': '$',
  'GBP': '£',
  'CHF': 'CHF',
};

/** UNTDID 4461 — Zahlungsarten */
export const PAYMENT_MEANS_CODES: Record<string, string> = {
  '10': 'Barzahlung',
  '30': 'Überweisung',
  '42': 'Zahlung auf Bankkonto',
  '48': 'Kartenzahlung',
  '49': 'Lastschrift',
  '57': 'Dauerauftrag',
  '58': 'SEPA-Überweisung',
  '59': 'SEPA-Lastschrift',
};

/** UNCL 5305 — USt-Kategorien */
export const VAT_CATEGORY_CODES: Record<string, string> = {
  'S': 'Normalsatz',
  'Z': 'Nullsatz',
  'E': 'Steuerbefreit',
  'AE': 'Reverse Charge',
  'K': 'Innergemeinschaftliche Lieferung',
  'G': 'Ausfuhr (Drittland)',
  'O': 'Nicht steuerbar',
  'L': 'Kanarische Inseln',
  'M': 'Ceuta und Melilla',
};

/** UN/ECE Recommendation 20 — Mengeneinheiten */
export const UNIT_CODES: Record<string, string> = {
  // Stückzahlen / Allgemein
  'C62': 'Stück',
  'EA':  'Einheit',
  'H87': 'Stück',
  'NAR': 'Anzahl Artikel',
  'NPR': 'Anzahl Paare',
  'P1':  'Prozent',
  'PR':  'Paar',
  'SET': 'Set',
  // Zeit
  'ANN': 'Jahr',
  'DAY': 'Tag',
  'HUR': 'Stunde',
  'MIN': 'Minute',
  'MON': 'Monat',
  'SEC': 'Sekunde',
  'WEE': 'Woche',
  // Masse
  'GRM': 'Gramm',
  'KGM': 'Kilogramm',
  'TNE': 'Tonne',
  // Länge
  'CMT': 'Zentimeter',
  'KTM': 'Kilometer',
  'LMT': 'Laufmeter',
  'MMT': 'Millimeter',
  'MTR': 'Meter',
  // Fläche
  'CMK': 'Quadratzentimeter',
  'MTK': 'Quadratmeter',
  // Volumen
  'LTR': 'Liter',
  'MLT': 'Milliliter',
  'MTQ': 'Kubikmeter',
  // Energie
  'KWH': 'Kilowattstunde',
  'KWT': 'Kilowatt',
  'MAW': 'Megawatt',
  'MWH': 'Megawattstunde',
  // Verpackung
  'KT':  'Kit',
  'XBX': 'Schachtel',
  'XKI': 'Kit (Verpackung)',
  'XPK': 'Paket',
  'XPX': 'Palette',
  // Sonstiges
  'ACT': 'Aktivität',
  'BQL': 'Becquerel',
  'LS':  'Pauschale',
};

/** ISO 3166-1 alpha-2 — Länder */
export const COUNTRY_CODES: Record<string, string> = {
  'DE': 'Deutschland',
  'AT': 'Österreich',
  'CH': 'Schweiz',
  'FR': 'Frankreich',
  'NL': 'Niederlande',
  'BE': 'Belgien',
  'IT': 'Italien',
  'ES': 'Spanien',
  'PL': 'Polen',
  'CZ': 'Tschechien',
  'GB': 'Vereinigtes Königreich',
  'US': 'Vereinigte Staaten',
};

/** Kleinunternehmerregelung §19 UStG — Hinweistext für Rechnung */
export const KLEINUNTERNEHMER_NOTE =
  'Gemäß §19 UStG wird keine Umsatzsteuer berechnet.';
