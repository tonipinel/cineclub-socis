// JSON per a `<script type="application/ld+json">`, escapant com el `jsonify` de Hugo
// (`<`, `>`, `&` i els separadors de línia) perquè no puguin tancar l'script.
export const jsonLd = (dades) => JSON.stringify(dades)
  .replace(/[<>&\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
