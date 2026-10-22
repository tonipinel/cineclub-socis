import { getDb, llegir } from './db.js';
import { creaMemo } from './memo.js';

const memo = creaMemo();

// `pagines/{slug}`: { slug, tipus, titol, dades, cos, imatges } o null.
// La lectura es memoritza ~60 s per slug (vegeu memo.js).
export async function paginaPerSlug(slug, db = getDb()) {
  if (!slug || slug.includes('/')) return null;
  return memo.obte(db, slug, async () => {
    const doc = await llegir(db.collection('pagines').doc(slug).get());
    return doc.exists ? doc.data() : null;
  });
}

// Les úniques pàgines de contingut que serveix `/<slug>/` (la resta d'adreces d'un sol segment són 404).
export const SLUGS_CONTINGUT = ['preguntes-frequents', 'privacitat'];

// Totes les pàgines de `pagines` que serveix la web (la portada a `/`): les úniques les URL antigues de les
// imatges de les quals (`/<fitxer>`, `/<slug>/<fitxer>`) poden redirigir a Storage.
export const SLUGS_PAGINES = ['portada', 'fes-te-socia', ...SLUGS_CONTINGUT];
