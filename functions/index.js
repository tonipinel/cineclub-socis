const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp();

const URL_SOLICITUDS = 'https://associacio.cineclubrodadebera.cat/solicituds';
const DESTINATARI = 'cineclub.rodadebera@gmail.com';
const LOGO_URL = 'https://cineclubrodadebera.cat/images/logo.png';

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

async function obtenirConfiguracio() {
  const snap = await getFirestore().doc('configuracio/associacio').get();
  const dades = snap.exists ? snap.data() : {};
  return {
    quotaAnual: dades.quotaAnual ?? 30,
    numeroCompte: dades.numeroCompte ?? '',
  };
}

function signatura() {
  return `
    <p style="margin-top:24px;">
      <img src="${LOGO_URL}" alt="Cineclub Roda de Berà" width="80" style="display:block;margin-bottom:8px;">
      <strong>Associació Cineclub Roda de Berà</strong>
    </p>
  `;
}

function missatgeNotificacioAdmin(dades) {
  const files = CAMPS
    .filter(([camp]) => dades[camp])
    .map(([camp, etiqueta]) => `<tr><td><strong>${etiqueta}</strong></td><td>${dades[camp]}</td></tr>`)
    .join('');
  return `
    <p>S'ha rebut una nova sol·licitud d'alta de soci/a.</p>
    <table cellpadding="4">${files}</table>
    <p><a href="${URL_SOLICITUDS}">Veure les sol·licituds pendents</a></p>
  `;
}

function missatgeBenvinguda(dades, config) {
  return `
    <p>Hola ${dades.nom},</p>
    <p>Moltes gràcies per haver omplert el formulari per formar part del Cineclub Roda de Berà. Ens fa molta il·lusió veure l'interès que està generant el projecte.</p>
    <p>T'informem del nostre compte bancari de l'associació per si vols tramitar el pagament de la quota anual (${config.quotaAnual}€): ${config.numeroCompte}.</p>
    <p>Si ho prefereixes, també pots pagar en efectiu o targeta en la propera sessió o algun dimecres en el nostre horari d'oficina a l'Hotel d'Entitats, que és de 15.15 a 16.15 hores (en aquest últim cas, consulta'ns abans perquè algun dimecres potser no hi som).</p>
    <p>Per avançar feina i que no et perdis cap informació mentrestant, t'afegirem al grup de whatsapp de socis i sòcies, allà és on centralitzem tota la informació i on generem les enquestes per triar les properes sessions.</p>
    <p>Gràcies per la confiança i per ajudar-nos a posar en marxa aquest espai de cinema a Roda de Berà.</p>
    <p>Si tens qualsevol dubte, comentari o suggeriment, estem a la teva disposició.</p>
    <p>Salut i cinema!</p>
  `;
}

exports.notificarNovaSolicitud = onDocumentCreated('solicituds/{id}', async (event) => {
  const dades = event.data.data();
  const config = await obtenirConfiguracio();
  const mail = getFirestore().collection('mail');

  await mail.add({
    to: DESTINATARI,
    from: DESTINATARI,
    message: {
      subject: `Nova sol·licitud d'alta: ${dades.nom} ${dades.cognoms}`,
      html: missatgeNotificacioAdmin(dades) + signatura(),
    },
  });

  if (dades.correuElectronic) {
    await mail.add({
      to: dades.correuElectronic,
      from: DESTINATARI,
      message: {
        subject: 'Benvingut/da al Cineclub Roda de Berà',
        html: missatgeBenvinguda(dades, config) + signatura(),
      },
    });
  }
});
