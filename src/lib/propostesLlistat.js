import { aData, sessionsPerProposta } from './tandes';
import { dadesEfectives, INTERNA_BUIDA } from '../components/GestioInternaProposta';

export const ESTATS = ['pendent', 'aprovada', 'rebutjada', 'programada'];
export const COLUMNES_ORDRE = ['titol', 'proposant', 'distribuidora', 'preu', 'estat', 'tanda', 'sessio', 'data'];
const VISTES = ['llista', 'tandes'];

export const PARAMETRES_PER_DEFECTE = {
  vista: 'llista',
  estats: ESTATS,
  tanda: 'totes',
  distribuidora: 'totes',
  cerca: '',
  ordre: { columna: 'data', direccio: 'desc' },
};

// Oberta primer i, després, la que tanca més tard; les que no tenen data de tancament, al final.
export const ordenarTandes = (a, b) => (
  Number(b.oberta) - Number(a.oberta) || (b.tanca?.getTime() ?? -Infinity) - (a.tanca?.getTime() ?? -Infinity) || 0
);

// Una tanda sense data de tancament es tracta com a tancada.
export function infoTanda(tanda, avui = new Date()) {
  const tanca = aData(tanda.tanca) ?? null;
  return { id: tanda.id, nom: tanda.nom, oberta: tanca !== null && tanca > avui, tanca };
}

function preuText(valor) {
  const text = String(valor ?? '');
  return text !== '' && Number.isNaN(Number(text)) ? '' : text;
}

export function construirFiles({
  propostes, internes, distribuidores, tandes, sessions, avui = new Date(),
}) {
  const sessioTriada = sessionsPerProposta(sessions);
  return propostes.map((proposta) => {
    const dadesInternes = internes.get(proposta.id);
    const interna = {
      ...INTERNA_BUIDA, ...dadesInternes, preu: preuText(dadesInternes?.preu), condicions: dadesInternes?.condicions ?? '',
    };
    const distribuidora = distribuidores.get(interna.distribuidoraId) ?? null;
    const { preu, preuPerDefecte } = dadesEfectives(interna, distribuidora);
    const sessio = sessions.find((s) => s.id === sessioTriada[proposta.id]);
    return {
      id: proposta.id,
      proposta,
      titol: proposta.titol,
      estat: proposta.estat ?? 'pendent',
      proposant: proposta.nomProposant ?? '',
      distribuidora: distribuidora ? { id: distribuidora.id, nom: distribuidora.nom } : null,
      preu,
      preuPerDefecte,
      tandes: tandes
        .filter((t) => (t.propostes ?? []).includes(proposta.id))
        .map((t) => infoTanda(t, avui))
        .sort(ordenarTandes),
      sessio: sessio ? { id: sessio.id, titol: sessio.titol } : null,
      data: proposta.timestamp ? aData(proposta.timestamp) : null,
    };
  });
}

const normalitzar = (text) => String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function filtrarFiles(files, {
  cerca = '', estats = ESTATS, tanda = 'totes', distribuidora = 'totes',
} = {}) {
  const terme = normalitzar(cerca.trim());
  return files.filter((f) => {
    if (!estats.includes(f.estat)) return false;
    if (tanda === 'cap' && f.tandes.length > 0) return false;
    if (tanda !== 'totes' && tanda !== 'cap' && !f.tandes.some((t) => t.id === tanda)) return false;
    if (distribuidora === 'cap' && f.distribuidora) return false;
    if (distribuidora !== 'totes' && distribuidora !== 'cap' && f.distribuidora?.id !== distribuidora) return false;
    if (!terme) return true;
    return [f.titol, f.proposant, f.distribuidora?.nom].some((camp) => normalitzar(camp).includes(terme));
  });
}

const VALORS_ORDENACIO = {
  titol: (f) => f.titol,
  proposant: (f) => f.proposant,
  distribuidora: (f) => f.distribuidora?.nom,
  preu: (f) => f.preu,
  estat: (f) => f.estat,
  tanda: (f) => f.tandes[0]?.nom,
  sessio: (f) => f.sessio?.titol,
  data: (f) => f.data?.getTime(),
};

const absent = (valor) => valor === null || valor === undefined || valor === '';
const compararText = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), 'ca', { sensitivity: 'base' });

export function ordenarFiles(files, { columna = 'data', direccio = 'desc' } = {}) {
  const valorDe = VALORS_ORDENACIO[columna] ?? VALORS_ORDENACIO.data;
  const factor = direccio === 'asc' ? 1 : -1;
  return [...files].sort((a, b) => {
    const va = valorDe(a);
    const vb = valorDe(b);
    if (absent(va) !== absent(vb)) return absent(va) ? 1 : -1;
    if (!absent(va)) {
      const diferencia = typeof va === 'number' ? va - vb : compararText(va, vb);
      if (diferencia !== 0) return diferencia * factor;
    }
    return compararText(a.titol, b.titol);
  });
}

// Cada fila ja porta les dades de les seves tandes (nom, oberta, tanca).
export function agruparPerTanda(files) {
  const grups = new Map();
  files.forEach((f) => {
    f.tandes.forEach((t) => {
      if (!grups.has(t.id)) grups.set(t.id, { clau: t.id, tanda: t, files: [] });
      grups.get(t.id).files.push(f);
    });
  });
  const resultat = [...grups.values()].sort((a, b) => ordenarTandes(a.tanda, b.tanda));
  const senseTanda = files.filter((f) => f.tandes.length === 0);
  if (senseTanda.length > 0) resultat.push({ clau: 'cap', tanda: null, files: senseTanda });
  return resultat;
}

export function recompteEstats(files) {
  const recompte = Object.fromEntries(ESTATS.map((e) => [e, 0]));
  new Map(files.map((f) => [f.id, f])).forEach((f) => {
    if (f.estat in recompte) recompte[f.estat] += 1;
  });
  return recompte;
}

export function llegirParametres(searchParams, { tandes = [], distribuidores = new Map() } = {}) {
  const d = PARAMETRES_PER_DEFECTE;
  const vista = searchParams.get('vista');

  const estatsDemanats = (searchParams.get('estat') ?? '').split(',');
  const estats = ESTATS.filter((e) => estatsDemanats.includes(e));

  const tanda = searchParams.get('tanda');
  const tandaValida = tanda === 'cap' || tandes.some((t) => t.id === tanda);

  const distribuidora = searchParams.get('distribuidora');
  const distribuidoraValida = distribuidora === 'cap' || distribuidores.has(distribuidora);

  const [columna, direccio] = (searchParams.get('ordre') ?? '').split(':');
  const ordreValid = COLUMNES_ORDRE.includes(columna) && ['asc', 'desc'].includes(direccio);

  return {
    vista: VISTES.includes(vista) ? vista : d.vista,
    estats: estats.length > 0 ? estats : d.estats,
    tanda: tandaValida ? tanda : d.tanda,
    distribuidora: distribuidoraValida ? distribuidora : d.distribuidora,
    cerca: searchParams.get('cerca') ?? d.cerca,
    ordre: ordreValid ? { columna, direccio } : d.ordre,
  };
}

export function escriureParametres(valors, defaults = PARAMETRES_PER_DEFECTE) {
  const params = new URLSearchParams();
  if (valors.vista !== defaults.vista) params.set('vista', valors.vista);
  const mateixosEstats = valors.estats.length === defaults.estats.length
    && defaults.estats.every((e) => valors.estats.includes(e));
  if (!mateixosEstats) params.set('estat', valors.estats.join(','));
  if (valors.tanda !== defaults.tanda) params.set('tanda', valors.tanda);
  if (valors.distribuidora !== defaults.distribuidora) params.set('distribuidora', valors.distribuidora);
  if (valors.cerca !== defaults.cerca) params.set('cerca', valors.cerca);
  if (valors.ordre.columna !== defaults.ordre.columna || valors.ordre.direccio !== defaults.ordre.direccio) {
    params.set('ordre', `${valors.ordre.columna}:${valors.ordre.direccio}`);
  }
  return params;
}
