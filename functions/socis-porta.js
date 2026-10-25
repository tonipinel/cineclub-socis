const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');

// Projecció de `socis` per a la porta (rol taquilla): `socisPorta/{numeroSoci}`. LLISTA BLANCA: només el que es
// mostra a la porta (nom, número, motiu de desactivació) i el que necessiten calcularEstatSoci, calcularVenciment,
// estaActiu i inicPeriodeEnEscanejar (src/lib/estatSoci.js) per donar el mateix estat i venciment que l'admin. Mai
// DNI, contacte ni el token del carnet en clar: del token només se'n desa el SHA-256 (`tokenHash`), que serveix per
// trobar el soci en escanejar el carnet però no per votar ni proposar com a ell.
const CAMPS_PORTA = Object.freeze([
  'numeroSoci', 'nom', 'cognoms', 'actiu', 'motiuDesactivacio',
  'ultimPagament', 'vigenciaDes', 'inicPeriode', 'modeVigencia', 'estatManual',
]);

function hashTokenCarnet(token) {
  if (typeof token !== 'string' || !token) return null;
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

// Id del document de porta: el número de soci en text, o null si no en té cap de vàlid.
function idPorta(soci) {
  const valor = soci?.numeroSoci;
  if (valor === undefined || valor === null || valor === '') return null;
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? String(numero) : null;
}

// Document de porta d'una fitxa de soci, o null si no té número (no pot entrar com a soci).
function docPorta(soci) {
  const id = idPorta(soci);
  if (!id) return null;
  const resultat = {};
  for (const camp of CAMPS_PORTA) {
    if (soci[camp] !== undefined) resultat[camp] = soci[camp];
  }
  resultat.numeroSoci = Number(id);
  resultat.tokenHash = hashTokenCarnet(soci.tokenCarnet);
  return resultat;
}

// Disparador de `socis/{id}`. `abans`/`despres` només decideixen si cal fer res i quins números antics cal netejar;
// el contingut surt de la fitxa ACTUAL (els disparadors poden arribar desordenats o repetits), dins d'una transacció.
// Un document de porta antic només s'esborra si és d'aquest soci (mateix tokenHash): si dos socis tinguessin el mateix
// número, no s'esborra el de l'altre. Si falla, registra només l'id i el codi d'error i llança (amb reintents).
async function sincronitzarSociPorta({ id, abans, despres, db, logger }) {
  try {
    if (isDeepStrictEqual(docPorta(abans), docPorta(despres))) return null;
    return await db.runTransaction(async (t) => {
      const snap = await t.get(db.doc(`socis/${id}`));
      const actual = snap.exists ? snap.data() : null;
      const nou = docPorta(actual);
      const idNou = nou ? idPorta(actual) : null;
      const hashesPropis = new Set([abans, despres, actual].filter(Boolean).map((s) => hashTokenCarnet(s.tokenCarnet)));
      const antics = [...new Set([idPorta(abans), idPorta(despres)])].filter((x) => x && x !== idNou);
      const refsAntics = antics.map((x) => db.doc(`socisPorta/${x}`));
      const snapsAntics = await Promise.all(refsAntics.map((r) => t.get(r)));
      let esborrats = 0;
      snapsAntics.forEach((s, i) => {
        if (s.exists && hashesPropis.has(s.get('tokenHash') ?? null)) {
          t.delete(refsAntics[i]);
          esborrats += 1;
        }
      });
      if (nou) t.set(db.doc(`socisPorta/${idNou}`), nou);
      return { escrit: idNou, esborrats };
    });
  } catch (e) {
    // Només l'id i el codi: el missatge d'error podria portar dades. Es torna a llançar perquè Eventarc ho reintenti
    // (`retry: true`): el reintent rellegeix la fitxa actual i repara el document.
    logger.error('No s\'ha pogut actualitzar socisPorta', { sociId: id, codi: e?.code ?? null });
    throw e;
  }
}

module.exports = { CAMPS_PORTA, hashTokenCarnet, idPorta, docPorta, sincronitzarSociPorta };
