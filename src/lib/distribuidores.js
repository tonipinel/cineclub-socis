import { generarSlug, EXTENSIONS_IMATGE } from './sessioPublica';

// El web es desa tal com l'escriu l'admin; per fer-ne un enllaç li afegim
// el protocol si no el porta.
export function urlWeb(web) {
  return /^https?:\/\//i.test(web) ? web : `https://${web}`;
}

export const camiLogoDistribuidora = (nom, fitxer, instant) =>
  `web/distribuidores/${generarSlug(nom)}-${instant}.${EXTENSIONS_IMATGE[fitxer.type]}`;

export function validarUrlPublica(valor) {
  const text = String(valor ?? '').trim();
  if (!text || /^https?:\/\/\S+$/i.test(text)) return null;
  return "L'adreça ha de començar per http:// o https://.";
}

// Sessions que referencien la distribuïdora pel seu id (`publica.suportDistribucioId`) o pel nom exacte
// (`publica.suportDistribucio`, el de les sessions antigues).
export const sessionsQueUsen = ({ id, nom }, sessions) =>
  sessions
    .filter(({ publica: p }) => (id && p?.suportDistribucioId === id)
      || (nom && typeof p?.suportDistribucio === 'string' && p.suportDistribucio === nom))
    .map(({ id: idSessio, titol }) => ({ id: idSessio, titol }));

// Prefix de les opcions «no és al catàleg»: un id de document de Firestore no pot contenir `/`.
const FORA_CATALEG = '/fora/';

// Opcions del selector «Suport de distribució» (el valor és l'id del document) i la triada.
// `actual` i `desada` són `{ nom, id }` de la sessió (formulari i valor desat). Si no són al catàleg (per id, o pel
// nom exacte si no tenen id) s'ofereixen com a «<nom> (no és al catàleg)» amb el parell sencer per no perdre'ls.
export function opcionsDistribucio(distribuidores, actual, desada) {
  const delCataleg = ({ nom, id }) => (id ? distribuidores.find((d) => d.id === id) : distribuidores.find((d) => d.nom === nom));
  const fora = [];
  for (const { nom, id } of [actual, desada]) {
    if ((nom || id) && !delCataleg({ nom, id }) && !fora.some((f) => f.nom === nom && f.id === id)) fora.push({ nom, id });
  }
  const opcions = [
    { valor: '', etiqueta: '—', nom: '', id: '' },
    ...fora.map(({ nom, id }, i) => ({ valor: `${FORA_CATALEG}${i}`, etiqueta: `${nom || id} (no és al catàleg)`, nom, id })),
    ...distribuidores.map(({ id, nom }) => ({ valor: id, etiqueta: nom, nom, id })),
  ];
  const cataleg = delCataleg(actual);
  const indexFora = fora.findIndex((f) => f.nom === actual.nom && f.id === actual.id);
  const valor = cataleg ? cataleg.id : indexFora >= 0 ? `${FORA_CATALEG}${indexFora}` : '';
  return { opcions, valor };
}

// Estat del formulari -> objecte de Firestore (logo i urlPublica només si hi són).
export function construirDistribuidora(dades) {
  const text = (v) => String(v ?? '').trim();
  const preu = text(dades.preu);
  const distribuidora = {
    nom: text(dades.nom),
    web: text(dades.web),
    contacte: text(dades.contacte),
    correu: text(dades.correu),
    preu: preu === '' ? null : Number(preu),
    condicions: text(dades.condicions),
  };
  if (text(dades.logo)) distribuidora.logo = text(dades.logo);
  if (text(dades.urlPublica)) distribuidora.urlPublica = text(dades.urlPublica);
  return distribuidora;
}
