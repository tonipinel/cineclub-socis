// Correus que s'envien quan arriba una sol·licitud d'alta del formulari públic. Qualsevol visitant pot
// crear-ne una, així que res del que porta no és de fiar: s'escapa tot el que va a l'HTML, la benvinguda
// només va a un únic correu ben format (i un sol cop per adreça) i hi ha límits perquè no es pugui
// esgotar la quota de Gmail del club.

const URL_SOLICITUDS = 'https://associacio.cineclubrodadebera.cat/solicituds';
const DESTINATARI = 'cineclub.rodadebera@gmail.com';
const LOGO_URL = 'https://cineclubrodadebera.cat/images/logo.png';

// Ara mateix arriben unes poques sol·licituds al mes: aquests límits només salten si algú n'abusa.
const LIMIT_BENVINGUDES_HORA = 30;
const LIMIT_AVISOS_DIA = 100;
const HORA = 60 * 60 * 1000;

const CAMPS = [
  ['nom', 'Nom'],
  ['cognoms', 'Cognoms'],
  ['dni', 'DNI'],
  ['poblacio', 'Població'],
  ['codiPostal', 'Codi postal'],
  ['telefon', 'Telèfon'],
  ['correuElectronic', 'Correu electrònic'],
  ['comentaris', 'Comentaris'],
];

const MOTIUS = {
  'correu-no-valid': 'el correu electrònic no té un format vàlid.',
  'nom-no-valid': 'nom no vàlid per a la benvinguda.',
  'correu-repetit': 'ja hi havia una sol·licitud amb aquest correu.',
  'massa-solicituds': 's\'han rebut massa sol·licituds en l\'última hora.',
};

const ESCAPS = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' };

function escaparHtml(valor) {
  if (typeof valor === 'number') return String(valor);
  if (typeof valor !== 'string') return '[valor no vàlid]';
  return valor.slice(0, 2000).replace(/\r\n|[\r\n]/g, ' ').replace(/[&<>"']/g, (c) => ESCAPS[c]);
}

// Per a l'assumpte, que és text pla: sense salts de línia ni caràcters de control.
function textPla(valor) {
  if (typeof valor !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return valor.slice(0, 80).replace(/\r\n|[\r\n]/g, ' ').replace(/[\u0000-\u001F\u007F]/g, '');
}

function correuValid(valor) {
  return typeof valor === 'string'
    && valor.length <= 254
    && /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(valor);
}

// La benvinguda comença amb «Hola <nom>», així que el nom ha de semblar un nom: només lletres, espais,
// apòstrofs, guionets i punts d'inicial («M. Àngels»), però cap punt enganxat a una lletra («evil.com»).
function nomValid(valor) {
  if (typeof valor !== 'string') return false;
  const nom = valor.trim();
  return /^\p{L}[\p{L} '’.-]{0,39}$/u.test(nom) && !/\.\p{L}/u.test(nom);
}

// Els correus es desen amb un id fix per sol·licitud: si el disparador es torna a executar (Firestore
// pot entregar el mateix esdeveniment més d'un cop), `create()` falla amb ALREADY_EXISTS i no s'envia res de nou.
async function crearCorreuUnCop(mail, id, correu) {
  try {
    await mail.doc(id).create(correu);
  } catch (error) {
    if (error?.code === 6 || /already exists/i.test(error?.message ?? '')) return;
    throw error;
  }
}

function signatura() {
  return `
    <p style="margin-top:24px;">
      <img src="${LOGO_URL}" alt="Cineclub Roda de Berà" width="80" style="display:block;margin-bottom:8px;">
      <strong>Associació Cineclub Roda de Berà</strong>
    </p>
  `;
}

function missatgeNotificacioAdmin(dades, motiu) {
  const files = CAMPS
    .filter(([camp]) => dades[camp])
    .map(([camp, etiqueta]) => `<tr><td><strong>${etiqueta}</strong></td><td>${escaparHtml(dades[camp])}</td></tr>`)
    .join('');
  const avis = motiu ? `\n    <p><strong>No s'ha enviat el correu de benvinguda: ${MOTIUS[motiu]}</strong></p>` : '';
  return `
    <p>S'ha rebut una nova sol·licitud d'alta de soci/a.</p>
    <table cellpadding="4">${files}</table>${avis}
    <p><a href="${URL_SOLICITUDS}">Veure les sol·licituds pendents</a></p>
  `;
}

function missatgeLimitDiari() {
  return `
    <p>S'han rebut més de ${LIMIT_AVISOS_DIA} sol·licituds d'alta en les últimes 24 hores. Fins que no baixin, no s'enviarà cap correu (ni avisos ni benvingudes); les sol·licituds es continuen desant.</p>
    <p><a href="${URL_SOLICITUDS}">Veure les sol·licituds pendents</a></p>
  `;
}

function missatgeBenvinguda(dades, config) {
  return `
    <p>Hola ${escaparHtml(dades.nom)},</p>
    <p>Moltes gràcies per haver omplert el formulari per formar part del Cineclub Roda de Berà. Ens fa molta il·lusió veure l'interès que està generant el projecte.</p>
    <p>T'informem del nostre compte bancari de l'associació per si vols tramitar el pagament de la quota anual (${escaparHtml(config.quotaAnual)}€): ${escaparHtml(config.numeroCompte)}.</p>
    <p>Si ho prefereixes, també pots pagar en efectiu o targeta en la propera sessió o algun dimecres en el nostre horari d'oficina a l'Hotel d'Entitats, que és de 15.15 a 16.15 hores (en aquest últim cas, consulta'ns abans perquè algun dimecres potser no hi som).</p>
    <p>Per avançar feina i que no et perdis cap informació mentrestant, t'afegirem al grup de whatsapp de socis i sòcies, allà és on centralitzem tota la informació i on generem les enquestes per triar les properes sessions.</p>
    <p>Gràcies per la confiança i per ajudar-nos a posar en marxa aquest espai de cinema a Roda de Berà.</p>
    <p>Si tens qualsevol dubte, comentari o suggeriment, estem a la teva disposició.</p>
    <p>Salut i cinema!</p>
  `;
}

// Hi ha una sol·licitud amb el mateix correu creada abans que aquesta? Les que no tenen data (importades)
// compten com a anteriors; amb la mateixa data, desempata l'id perquè només una rebi la benvinguda.
async function correuRepetit(deps, id, correu, ms) {
  const variants = [...new Set([correu, correu.toLowerCase()])];
  const altres = (await deps.solicitudsAmbCorreu(variants)).filter((s) => s.id !== id);
  return altres.some((s) => ms == null || s.ms == null || s.ms < ms || (s.ms === ms && s.id < id));
}

async function motiuSenseBenvinguda(deps, id, dades, ara) {
  const correu = dades.correuElectronic;
  if (!correuValid(correu)) return 'correu-no-valid';
  if (!nomValid(dades.nom)) return 'nom-no-valid';
  if (await deps.comptarDesDe(new Date(ara - HORA)) > LIMIT_BENVINGUDES_HORA) return 'massa-solicituds';
  if (await correuRepetit(deps, id, correu, dades.timestamp?.toMillis?.() ?? null)) return 'correu-repetit';
  return null;
}

// `deps`: obtenirConfiguracio(), mail (la col·lecció `mail`), comptarDesDe(data) (sol·licituds creades des
// d'aleshores, aquesta inclosa), solicitudsAmbCorreu(variants) → [{ id, ms }], avisar(missatge, dades).
async function gestionarNovaSolicitud(deps, id, dades, ara) {
  const recentsDia = await deps.comptarDesDe(new Date(ara - 24 * HORA));
  if (recentsDia > LIMIT_AVISOS_DIA) {
    deps.avisar('No s\'envia cap correu de la sol·licitud', { id, motiu: 'limit-diari' });
    if (recentsDia === LIMIT_AVISOS_DIA + 1) {
      await crearCorreuUnCop(deps.mail, `solicitud-${id}-limit`, {
        to: DESTINATARI,
        from: DESTINATARI,
        message: { subject: 'Massa sol·licituds d\'alta en 24 hores', html: missatgeLimitDiari() + signatura() },
      });
    }
    return;
  }

  const motiu = dades.correuElectronic ? await motiuSenseBenvinguda(deps, id, dades, ara) : null;
  if (motiu) deps.avisar('No s\'envia la benvinguda de la sol·licitud', { id, motiu });

  await crearCorreuUnCop(deps.mail, `solicitud-${id}-admin`, {
    to: DESTINATARI,
    from: DESTINATARI,
    message: {
      subject: `Nova sol·licitud d'alta: ${textPla(dades.nom)} ${textPla(dades.cognoms)}`,
      html: missatgeNotificacioAdmin(dades, motiu) + signatura(),
    },
  });

  if (dades.correuElectronic && !motiu) {
    const config = await deps.obtenirConfiguracio();
    await crearCorreuUnCop(deps.mail, `solicitud-${id}-benvinguda`, {
      to: dades.correuElectronic,
      from: DESTINATARI,
      message: {
        subject: 'Benvingut/da al Cineclub Roda de Berà',
        html: missatgeBenvinguda(dades, config) + signatura(),
      },
    });
  }
}

module.exports = {
  LIMIT_BENVINGUDES_HORA, LIMIT_AVISOS_DIA, escaparHtml, textPla, correuValid, nomValid, crearCorreuUnCop,
  gestionarNovaSolicitud,
};
