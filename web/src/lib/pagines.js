import { getDb, llegir } from './db.js';

// `pagines/{slug}`: { slug, tipus, titol, dades, cos, imatges } o null.
export async function paginaPerSlug(slug, db = getDb()) {
  if (!slug || slug.includes('/')) return null;
  const doc = await llegir(db.collection('pagines').doc(slug).get());
  return doc.exists ? doc.data() : null;
}

// Les úniques pàgines de contingut que serveix `/<slug>/` (la resta d'adreces d'un sol segment són 404).
export const SLUGS_CONTINGUT = ['preguntes-frequents', 'privacitat'];
