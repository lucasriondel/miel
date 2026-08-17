/**
 * Multilingual vocabulary for verification-code detection: English, French,
 * German, Spanish, Italian.
 *
 * Kept apart from `detectConfirmation.ts` so the word lists can grow without
 * the matching logic moving around them.
 *
 * Everything here is matched case-insensitively against text that has already
 * been accent-folded by `foldAccents()`, so entries are written unaccented
 * (`verifie`, not `vérifié`) and lowercase. German umlauts fold to the bare
 * vowel the same way (`bestatigung`), and `ß` is expanded to `ss`.
 */

/** Strip diacritics and normalise ß so the word lists can stay ASCII. */
export function foldAccents(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss");
}

/**
 * Nouns naming the thing itself ("code", "Bestätigungscode", "codice di
 * verifica"). Used as the anchor to the left of a candidate number.
 *
 * German compounds are covered by matching the bare stem plus an optional
 * suffix run — `bestatigungscode`, `sicherheitscode` and `zugangscode` all
 * end in `code`, so the English entry catches them; the standalone German
 * words below are the ones that don't (`kennwort`, `pin`).
 */
export const CODE_NOUNS = [
  // en
  "code",
  "codes",
  "otp",
  "one-time code",
  "one time code",
  "one-time password",
  "one time password",
  "passcode",
  "pin",
  "pin code",
  "security code",
  "verification code",
  "confirmation code",
  "access code",
  "token",
  // fr
  "code de verification",
  "code de confirmation",
  "code de securite",
  "code d'acces",
  "code confidentiel",
  "code a usage unique",
  "code secret",
  "mot de passe a usage unique",
  // de
  "bestatigungscode",
  "sicherheitscode",
  "verifizierungscode",
  "zugangscode",
  "einmalcode",
  "einmalpasswort",
  "kennwort",
  "kennzahl",
  // es
  "codigo",
  "codigo de verificacion",
  "codigo de confirmacion",
  "codigo de seguridad",
  "codigo de acceso",
  "clave",
  "clave de acceso",
  "contrasena de un solo uso",
  // it
  "codice",
  "codice di verifica",
  "codice di conferma",
  "codice di sicurezza",
  "codice di accesso",
  "codice temporaneo",
  "password monouso",
] as const;

/**
 * Verbs/adjectives that mark a message as a verification flow at all. Used
 * only as a cheap pre-filter — a hit here is necessary but never sufficient,
 * because a real code still has to sit next to a CODE_NOUN.
 */
export const CONFIRM_KEYWORDS = [
  // en
  "verify",
  "verification",
  "verified",
  "confirm",
  "confirmation",
  "authenticate",
  "authentication",
  "sign in",
  "sign-in",
  "signin",
  "log in",
  "login",
  "activate",
  "activation",
  "two-factor",
  "two factor",
  "2fa",
  "reset your password",
  // fr
  "verifier",
  "verification",
  "verifiez",
  "confirmer",
  "confirmation",
  "confirmez",
  "authentification",
  "authentifier",
  "connexion",
  "connectez",
  "activer",
  "activation",
  "double authentification",
  "reinitialiser",
  // de
  "bestatigen",
  "bestatigung",
  "bestatige",
  "verifizieren",
  "verifizierung",
  "authentifizierung",
  "anmelden",
  "anmeldung",
  "aktivieren",
  "aktivierung",
  "zwei-faktor",
  "zwei faktor",
  "passwort zurucksetzen",
  // es
  "verificar",
  "verificacion",
  "verifica",
  "confirmar",
  "confirmacion",
  "confirma",
  "autenticacion",
  "iniciar sesion",
  "inicio de sesion",
  "activar",
  "activacion",
  "doble factor",
  "restablecer",
  // it
  "verificare",
  "verifica",
  "verificato",
  "confermare",
  "conferma",
  "autenticazione",
  "accedi",
  "accesso",
  "attivare",
  "attivazione",
  "due fattori",
  "reimposta",
] as const;

/**
 * Copulas and prepositions that can sit between the noun and the digits —
 * "code is 482913", "code est 482913", "Code lautet 482913", "el codigo es
 * 482913", "il codice e 482913".
 *
 * Also covers the possessive/article run that precedes the noun in
 * "your verification code", "votre code", "Ihr Code", "su codigo".
 */
export const CONNECTORS = [
  // en
  "is",
  "are",
  "was",
  // fr
  "est",
  "sont",
  // de
  "ist",
  "lautet",
  "lautet:",
  // es
  "es",
  "son",
  // it
  "e",
  "sono",
] as const;

/**
 * Article/possessive run allowed between the sentence start and the noun, so
 * "Your verification code" and "Votre code de confirmation" both anchor.
 */
export const DETERMINERS = [
  "the",
  "your",
  "our",
  "a",
  "an",
  "this",
  "le",
  "la",
  "les",
  "votre",
  "vos",
  "un",
  "une",
  "ce",
  "der",
  "die",
  "das",
  "dein",
  "deine",
  "ihr",
  "ihre",
  "el",
  "los",
  "las",
  "su",
  "sus",
  "tu",
  "tus",
  "il",
  "lo",
  "i",
  "gli",
  "tuo",
  "il tuo",
  "suo",
] as const;

/**
 * Words that, when they sit next to a number, mean it is NOT a verification
 * code — order numbers, invoices, tracking, amounts, phone numbers. Checked
 * in a small window around the match to kill the most common false positives.
 */
export const NEGATIVE_CONTEXT = [
  // en
  "order",
  "invoice",
  "receipt",
  "tracking",
  "reference number",
  "account number",
  "customer number",
  "ticket",
  "phone",
  "zip",
  "postcode",
  "amount",
  "total",
  "balance",
  "vat",
  // fr
  "commande",
  "facture",
  "recu",
  "suivi",
  "numero de client",
  "numero de compte",
  "telephone",
  "montant",
  "total",
  "tva",
  // de
  "bestellung",
  "bestellnummer",
  "rechnung",
  "rechnungsnummer",
  "sendungsnummer",
  "kundennummer",
  "kontonummer",
  "telefon",
  "betrag",
  "summe",
  "mwst",
  // es
  "pedido",
  "factura",
  "recibo",
  "seguimiento",
  "numero de cliente",
  "numero de cuenta",
  "telefono",
  "importe",
  "total",
  "iva",
  // it
  "ordine",
  "fattura",
  "ricevuta",
  "spedizione",
  "numero cliente",
  "numero di conto",
  "telefono",
  "importo",
  "totale",
  "iva",
] as const;

/** URL path/query fragments that mark a link as a verification link. */
export const LINK_MARKERS = [
  // en + shared
  "verify",
  "verification",
  "confirm",
  "confirmation",
  "activate",
  "activation",
  "auth",
  "authenticate",
  "login",
  "signin",
  "sign-in",
  "magic",
  "otp",
  "token",
  "validate",
  // fr
  "verifier",
  "confirmer",
  "activer",
  "connexion",
  "valider",
  // de
  "bestatigen",
  "bestatigung",
  "verifizieren",
  "anmelden",
  "aktivieren",
  // es
  "verificar",
  "confirmar",
  "activar",
  "acceder",
  "validar",
  // it
  "verificare",
  "confermare",
  "attivare",
  "accedi",
  "convalida",
] as const;
