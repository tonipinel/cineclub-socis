import { urlize } from './format.js';

// Sessió d'entrada (objecte pla, el construeix el codi d'accés a dades):
//   { data: 'AAAA-MM-DD', hora?, publicada: boolean,
//     publica: { directors: string[], generes: string[], interprets: string[] } }
// Només es consideren les sessions amb `publicada === true`.
//
// Cada terme és `{ nom, slug, sessions }` amb les sessions de la més antiga a la més nova. Hugo
// agrupa els termes per `urlize` i `.Title` és la primera grafia que troba: aquí la de la sessió
// més antiga (a igualtat de data, la hora i, després, l'ordre d'entrada). L'ordre alfabètic és el
// del col·lacionador català (com `.Pages.ByTitle` de Hugo): «Àlex» entre «Adam» i «Alex Wolff».
const clau = (s) => `${s.data} ${s.hora || '00:00'}`;

export function termesDe(sessions, camp) {
  const ordenades = sessions
    .filter((s) => s.publicada === true)
    .sort((a, b) => (clau(a) < clau(b) ? -1 : clau(a) > clau(b) ? 1 : 0));
  const perSlug = new Map();
  for (const sessio of ordenades) {
    for (const nom of sessio.publica?.[camp] ?? []) {
      if (!nom) continue;
      const slug = urlize(nom);
      if (!perSlug.has(slug)) perSlug.set(slug, { nom, slug, sessions: [] });
      perSlug.get(slug).sessions.push(sessio);
    }
  }
  return [...perSlug.values()].sort((a, b) => a.nom.localeCompare(b.nom, 'ca'));
}

// `param` és el segment de la URL ja decodificat (`alauda-ruiz-de-azúa`, tant si el navegador
// va demanar `azúa` com `az%C3%BAa`). Es compara amb el slug exacte, normalitzat a NFC.
export const trobaTerme = (termes, param) => {
  if (typeof param !== 'string' || !param) return null;
  const buscat = param.normalize('NFC');
  return termes.find((t) => t.slug.normalize('NFC') === buscat) ?? null;
};
