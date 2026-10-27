// Lògica pura de la fitxa de proposta: conversió entre el document de Firestore i el text del formulari,
// i càlcul dels camps que l'admin ha editat a mà (`campsEditats`, que TMDB ja no sobreescriu).

// Mateixa llista i ordre que `CAMPS_EDITABLES` de functions/fitxa-proposta.js (una prova ho vigila).
export const CAMPS_PELLICULA = ['titol', 'titolLocal', 'any', 'durada', 'directors', 'guionistes', 'fotografia', 'muntatge',
  'musica', 'produccio', 'paisos', 'idiomes', 'generes', 'repartiment', 'lema', 'sinopsi', 'trailerUrl', 'imatgeUrl'];

export const ETIQUETES_CAMPS = {
  titol: 'Títol',
  titolLocal: 'Títol a Espanya',
  any: 'Any',
  durada: 'Durada (minuts)',
  directors: 'Direcció',
  guionistes: 'Guió',
  fotografia: 'Fotografia',
  muntatge: 'Muntatge',
  musica: 'Música',
  produccio: 'Producció',
  paisos: 'Països',
  idiomes: 'Idiomes',
  generes: 'Gèneres',
  repartiment: 'Repartiment',
  lema: 'Lema',
  sinopsi: 'Sinopsi',
  trailerUrl: 'URL del tràiler',
  imatgeUrl: 'URL del cartell',
};

const LLISTES = ['directors', 'guionistes', 'fotografia', 'muntatge', 'musica', 'produccio', 'paisos', 'idiomes', 'generes'];
const TEXTOS = ['titolLocal', 'lema', 'sinopsi'];
const URLS = ['trailerUrl', 'imatgeUrl'];

const text = (v) => (v == null ? '' : String(v));

export function formatRepartiment(llista) {
  return (Array.isArray(llista) ? llista : [])
    .map(({ nom, personatge }) => (personatge ? `${nom} (${personatge})` : text(nom)))
    .join('\n');
}

// El personatge és l'últim bloc entre parèntesis de la línia, només si la línia acaba en `)`.
export function parseRepartiment(textRepartiment) {
  const actors = [];
  for (const linia of text(textRepartiment).split('\n')) {
    const l = linia.trim();
    if (!l) continue;
    let obert = -1;
    if (l.endsWith(')')) {
      let fondaria = 0;
      for (let i = l.length - 1; i >= 0; i -= 1) {
        if (l[i] === ')') fondaria += 1;
        else if (l[i] === '(') {
          fondaria -= 1;
          if (fondaria === 0) { obert = i; break; }
        }
      }
    }
    const nom = obert > 0 ? l.slice(0, obert).trim() : '';
    if (obert > 0 && nom) actors.push({ nom, personatge: l.slice(obert + 1, -1).trim() });
    else actors.push({ nom: l, personatge: '' });
  }
  return actors;
}

export function fitxaAFormulari(proposta) {
  const p = proposta ?? {};
  const form = {};
  for (const camp of CAMPS_PELLICULA) {
    if (LLISTES.includes(camp)) form[camp] = (Array.isArray(p[camp]) ? p[camp] : []).join(', ');
    else if (camp === 'repartiment') form[camp] = formatRepartiment(p[camp]);
    else form[camp] = text(p[camp]);
  }
  return form;
}

const llistaDeText = (t) => text(t).split(',').map((x) => x.trim()).filter(Boolean)
  .filter((x, i, tots) => x !== tots[i - 1]);

export function formulariAFitxa(form) {
  const valors = {};
  const errors = {};
  for (const camp of CAMPS_PELLICULA) {
    const v = text(form?.[camp]).trim();
    if (camp === 'titol') {
      valors.titol = v;
      if (!v) errors.titol = 'El títol no pot estar en blanc.';
    } else if (camp === 'any') {
      valors.any = v ? Number(v) : null;
      if (v && !/^\d{4}$/.test(v)) errors.any = "L'any ha de tenir 4 xifres.";
    } else if (camp === 'durada') {
      valors.durada = v ? Number(v) : null;
      if (v && !(/^\d+$/.test(v) && Number(v) > 0)) errors.durada = 'La durada ha de ser un nombre enter de minuts.';
    } else if (LLISTES.includes(camp)) {
      valors[camp] = llistaDeText(v);
    } else if (camp === 'repartiment') {
      valors.repartiment = parseRepartiment(v);
    } else if (URLS.includes(camp)) {
      valors[camp] = v;
      if (v && !/^https?:\/\//i.test(v)) errors[camp] = "L'adreça ha de començar per http:// o https://.";
    } else if (TEXTOS.includes(camp)) {
      valors[camp] = v;
    }
  }
  return { valors, errors };
}

// Compara contra el formulari base (el del moment de carregar), no contra cap reconversió.
export function campsCanviats(form, base) {
  return CAMPS_PELLICULA.filter((camp) => text(form?.[camp]).trim() !== text(base?.[camp]).trim());
}

export function campsEditatsNous(actuals = [], canviats = []) {
  const units = new Set([...(Array.isArray(actuals) ? actuals : []), ...(Array.isArray(canviats) ? canviats : [])]);
  return CAMPS_PELLICULA.filter((camp) => units.has(camp));
}

export function esCampEditat(proposta, camp) {
  if (proposta?.campsEditats?.includes(camp)) return true;
  return camp === 'sinopsi' && proposta?.sinopsiIdioma === 'ca' && !!proposta?.sinopsi;
}

// Només s'ha de cridar amb valors vàlids: fes servir `prepararDesatFitxa`.
export function valorsADesar({ valors, canviats = [], proposta } = {}) {
  if (!canviats.length) return {};
  const desar = {};
  for (const camp of canviats) desar[camp] = valors[camp];
  desar.campsEditats = campsEditatsNous(proposta?.campsEditats, canviats);
  if (canviats.includes('sinopsi')) desar.sinopsiIdioma = 'ca';
  return desar;
}

// Únic punt d'entrada per desar: només valida els camps tocats (un valor antic no vàlid d'un camp que no
// s'ha tocat no bloqueja el desat) i no genera payload si hi ha cap error.
export function prepararDesatFitxa({ form, base, proposta }) {
  const canviats = campsCanviats(form, base);
  if (!canviats.length) return { canviats: [], errors: {}, payload: {} };
  const { valors, errors: tots } = formulariAFitxa(form);
  const errors = Object.fromEntries(Object.entries(tots).filter(([camp]) => canviats.includes(camp)));
  const payload = Object.keys(errors).length ? {} : valorsADesar({ valors, canviats, proposta });
  return { canviats, errors, payload };
}
