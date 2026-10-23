import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// Guarda: la imatge d'una sessió només es llegeix amb `imatgeDeSessio` (src/lib/sessions.js). Cap altre
// codi de src/ pot llegir `imatgeUrl` si no és en aquesta llista, amb el nombre exacte d'aparicions.
const PERMESOS = {
  // La funció única que tria entre `publica.cartell` i el valor de reserva.
  'src/lib/sessions.js': { 'sessio?.imatgeUrl': 1 },
  // Edició: en desar un cartell públic nou se'n copia la URL al valor de reserva.
  'src/lib/desarSessio.js': { 'nou.imatgeUrl': 1 },
  // Propostes (no sessions): el cartell de la proposta, que passa a `publica.cartell` en programar-la.
  'src/lib/sessioPublica.js': { 'proposta.imatgeUrl': 1 },
  'src/pages/Propostes/PropostaForm.jsx': { 'dades.imatgeUrl': 5 },
  // El cartell de la proposta a la targeta per triar-la en una tanda.
  'src/components/CartaPropostaTanda.jsx': { 'proposta.imatgeUrl': 1 },
};

const ARREL = join(import.meta.dirname, '..', '..');
const fitxers = (dir) => readdirSync(dir).flatMap((nom) => {
  const complet = join(dir, nom);
  if (statSync(complet).isDirectory()) return fitxers(complet);
  return /\.(js|jsx)$/.test(nom) && !/\.test\.(js|jsx)$/.test(nom) ? [complet] : [];
});

// `x.imatgeUrl`, `x?.imatgeUrl`, `x['imatgeUrl']` i desestructuracions `{ imatgeUrl } = x`.
const LECTURA = /([\w$]+\??)\.imatgeUrl\b|\[\s*['"`]imatgeUrl['"`]\s*\]|\{[^{}]*\bimatgeUrl\b[^{}:]*\}\s*=/g;

function lectures() {
  const trobades = {};
  for (const fitxer of fitxers(join(ARREL, 'src'))) {
    const cami = relative(ARREL, fitxer);
    for (const [tot, objecte] of readFileSync(fitxer, 'utf8').matchAll(LECTURA)) {
      const clau = objecte ? `${objecte}.imatgeUrl` : tot.replace(/\s+/g, ' ');
      trobades[cami] ??= {};
      trobades[cami][clau] = (trobades[cami][clau] ?? 0) + 1;
    }
  }
  return trobades;
}

describe('guarda de la imatge de les sessions', () => {
  it('cap fitxer de src/ llegeix imatgeUrl fora de la llista permesa (cal fer servir imatgeDeSessio)', () => {
    expect(lectures()).toEqual(PERMESOS);
  });

  it('el detector troba les lectures directes', () => {
    const text = "s.imatgeUrl; s?.imatgeUrl; s['imatgeUrl']; const { titol, imatgeUrl } = s;";
    expect([...text.matchAll(LECTURA)]).toHaveLength(4);
  });
});
