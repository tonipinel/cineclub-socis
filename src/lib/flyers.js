// Lògica pura dels flyers (`flyers/{id}`): triar sessions i detectar canvis respecte a la base.
// `versioTipus` viu a `sessio.publica.versioTipus`.

// Un flyer té de 3 a 5 sessions (límit dur: més de 5 no es pot desar com a publicat ni publicar).
export const MIN_SESSIONS = 3;
export const MAX_SESSIONS = 5;

// `AAAA-MM-DD` d'un dia que existeix (el 31 de febrer no).
const dataValida = (data) => {
  if (typeof data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
  const [any, mes, dia] = data.split('-').map(Number);
  const d = new Date(Date.UTC(any, mes - 1, dia));
  return d.getUTCFullYear() === any && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
};

const versioDe = (sessio) => sessio.publica?.versioTipus ?? '';

export function sessionsDelRang(sessions, desde, fins) {
  return sessions
    .filter((s) => s.data >= desde && s.data <= fins)
    .sort((a, b) => `${a.data} ${a.hora ?? ''}`.localeCompare(`${b.data} ${b.hora ?? ''}`))
    .map((s) => s.id);
}

export function validarFlyer({ nom, desde, fins, sessionsIds }, sessions) {
  const errors = {};
  if (!nom?.trim()) errors.nom = 'Cal un nom.';
  if (!dataValida(desde)) errors.desde = 'Cal una data d\'inici vàlida.';
  if (!dataValida(fins)) errors.fins = 'Cal una data de fi vàlida.';
  if (!errors.desde && !errors.fins && desde > fins) errors.desde = 'La data d\'inici ha de ser anterior a la de fi.';

  const ids = sessionsIds ?? [];
  const missatges = [];
  if (ids.length < MIN_SESSIONS) missatges.push(`Calen almenys ${MIN_SESSIONS} sessions.`);
  if (ids.length > MAX_SESSIONS) missatges.push(`Un flyer té de ${MIN_SESSIONS} a ${MAX_SESSIONS} sessions. Desmarca'n alguna.`);
  for (const id of ids) {
    const sessio = sessions.find((s) => s.id === id);
    if (!sessio) missatges.push(`La sessió ${id} ja no existeix.`);
    else if (!versioDe(sessio)) missatges.push(`«${sessio.titol}» no té versió.`);
  }
  if (missatges.length) errors.sessionsIds = missatges;

  return { errors };
}

export function instantania(sessio) {
  return {
    data: sessio.data,
    hora: sessio.hora,
    titol: sessio.titol,
    versioTipus: versioDe(sessio),
    publicada: sessio.publicada === true,
  };
}

export function canvisDesdeBase(flyer, sessionsPerId) {
  const canvis = [];
  for (const [sessionId, base] of Object.entries(flyer.base ?? {})) {
    const actual = sessionsPerId[sessionId];
    if (!actual) {
      canvis.push({ sessionId, titol: base.titol, tipus: 'esborrada' });
      continue;
    }
    const ara = instantania(actual);
    const push = (tipus) => canvis.push({ sessionId, titol: ara.titol, tipus });
    // Una base anterior a aquest camp només podia tenir sessions publicades.
    if (base.publicada !== false && ara.publicada !== true) push('despublicada');
    if (ara.data !== base.data) push('data');
    if (ara.hora !== base.hora) push('hora');
    if (ara.versioTipus !== base.versioTipus) push('versio');
    if (ara.titol !== base.titol) push('titol');
  }
  return canvis;
}

// Sessions del flyer que no existeixen o encara no són publicades.
export function sessionsNoPublicades(flyer, sessionsPerId) {
  return (flyer.sessionsIds ?? []).flatMap((sessionId) => {
    const sessio = sessionsPerId[sessionId];
    if (sessio?.publicada === true) return [];
    return [{ sessionId, titol: sessio?.titol ?? `Sessió esborrada (${sessionId})` }];
  });
}

// Actiu = publicat i amb totes les sessions publicades. Es calcula, no es desa.
export function flyerActiu(flyer, sessionsPerId) {
  return flyer.estat === 'publicat' && sessionsNoPublicades(flyer, sessionsPerId).length === 0;
}

// «Esborrany», «Actiu» o «Publicat, pendent de publicar N sessions».
export function etiquetaEstat(flyer, sessionsPerId) {
  if (flyer.estat !== 'publicat') return 'Esborrany';
  const n = sessionsNoPublicades(flyer, sessionsPerId).length;
  if (n === 0) return 'Actiu';
  return `Publicat, pendent de publicar ${n} ${n === 1 ? 'sessió' : 'sessions'}`;
}
