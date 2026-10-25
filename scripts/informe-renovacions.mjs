// Ús: node scripts/informe-renovacions.mjs
// INFORME DE NOMÉS LECTURA (no té cap mode d'escriptura): llista els socis amb quin venciment donava la regla d'abans
// i quin en donen la regla actual (src/lib/estatSoci.js: renovacions anticipades i renovació sempre encadenada), perquè
// la propietat revisi els canvis abans o després del desplegament. Per a cada soci compara:
//  - abans: (inicPeriode || ultimPagament) + 1 any, la fórmula anterior. Una fitxa amb `vigenciaDes` ja l'ha escrit
//    l'app nova (ultimPagament hi és la data real del cobrament) i la fórmula anterior no hi té sentit: surt com «—»;
//  - ara: calcularVenciment amb els camps desats (canvia en desplegar només si un escaneig havia fixat inicPeriode
//    abans de la data pagada, el bug que feia perdre dies);
//  - historial: el que quedaria si la fitxa es resincronitzés amb els moviments de quota (passa en editar o eliminar
//    un d'aquests moviments), p. ex. renovacions antigues desades amb la data real d'un pagament anticipat.
// La renovació sempre encadenada només afecta les quotes que es registren a partir d'ara (porten `modeVigencia`): les
// dades desades abans donen el mateix venciment. També compta quants socis pagaran la propera quota com a alta (comptarà
// des del primer escaneig): sol·licituds aprovades encara sense pagar, socis de baixa i reactivats sense pagar.
// Només llegeix `socis` i els moviments de "Quotes socis", i només mostra el número de soci (cap nom ni id).
// Credencials: GOOGLE_APPLICATION_CREDENTIALS o la clau
// cineclub-socis-firebase-adminsdk-*.json de l'arrel.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { calcularVenciment, sincronitzacioQuotes, tipusPagamentQuota } from '../src/lib/estatSoci.js';

const ARREL = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CATEGORIA_QUOTA_SOCI = 'Quotes socis';

const iso = (data) => data.toLocaleDateString('sv-SE');

function vencimentAntic(soci) {
  const [any, mes, dia] = (soci.inicPeriode || soci.ultimPagament).split('-').map(Number);
  return iso(new Date(any + 1, mes - 1, dia));
}

// `socis`: dades de cada soci; `moviments`: dades dels moviments de quota. Retorna només els socis on algun venciment
// canvia, quants socis amb número no tenen cap moviment de quota i de quants la propera quota serà una alta.
export function comparar(socis, moviments) {
  const quotesPerNumero = new Map();
  for (const m of moviments) {
    if (m.categoria !== CATEGORIA_QUOTA_SOCI || !m.data || !Number(m.numeroSoci)) continue;
    const numero = Number(m.numeroSoci);
    if (!quotesPerNumero.has(numero)) quotesPerNumero.set(numero, []);
    quotesPerNumero.get(numero).push(m);
  }
  const canvis = [];
  let senseQuotes = 0;
  let properaAlta = 0;
  for (const soci of socis) {
    if (!soci.numeroSoci || !soci.ultimPagament) continue;
    const quotes = quotesPerNumero.get(Number(soci.numeroSoci)) ?? [];
    if (quotes.length === 0) senseQuotes++;
    if (tipusPagamentQuota(soci, { teQuotes: quotes.length > 0 }) === 'alta') properaAlta++;
    const abans = soci.vigenciaDes ? null : vencimentAntic(soci);
    const ara = iso(calcularVenciment(soci));
    const historial = iso(calcularVenciment({ ...soci, ...sincronitzacioQuotes(soci, quotes) }));
    if ((abans !== null && abans !== ara) || ara !== historial) {
      canvis.push({ numeroSoci: soci.numeroSoci, abans, ara, historial });
    }
  }
  canvis.sort((a, b) => Number(a.numeroSoci) - Number(b.numeroSoci));
  return { canvis, senseQuotes, properaAlta };
}

export async function executar({ db, log = console.log }) {
  const [socisSnap, movimentsSnap] = await Promise.all([
    db.collection('socis').get(),
    db.collection('moviments').where('categoria', '==', CATEGORIA_QUOTA_SOCI).get(),
  ]);
  const socis = socisSnap.docs.map((d) => d.data());
  const { canvis, senseQuotes, properaAlta } = comparar(socis, movimentsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
  log("=== Venciments amb la renovació sempre encadenada (INFORME: no s'escriu res) ===");
  log(`Socis: ${socis.length} | amb algun canvi: ${canvis.length} | amb número però sense cap quota: ${senseQuotes}`
    + ` | la propera quota serà una alta: ${properaAlta}`);
  for (const c of canvis) {
    log(`Soci ${c.numeroSoci}: abans ${c.abans ?? '— (ja desat per l\'app nova)'} | ara ${c.ara} | amb l'historial ${c.historial}`);
  }
  return { canvis, senseQuotes, properaAlta };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { initializeApp, cert, applicationDefault } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  let credential = applicationDefault();
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const key = readdirSync(ARREL).find((f) => /^cineclub-socis-firebase-adminsdk-.*\.json$/.test(f));
    if (key) credential = cert(JSON.parse(readFileSync(join(ARREL, key), 'utf8')));
  }
  try {
    await executar({ db: getFirestore(initializeApp({ credential })) });
  } catch (err) {
    console.error(`\nERROR: ${err.message}`);
    process.exitCode = 1;
  }
}
