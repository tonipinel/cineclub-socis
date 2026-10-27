// Gestió interna (privada) d'una pel·lícula: `propostesInternes/{propostaId}`. La fitxa de proposta i la de sessió
// l'editen amb el mateix format de formulari.
const CAMPS = ['preu', 'condicions', 'distribuidoraId'];

export const internaAFormulari = (interna) => ({
  preu: String(interna?.preu ?? ''),
  condicions: interna?.condicions ?? '',
  distribuidoraId: interna?.distribuidoraId ?? '',
});

export const internaADesar = (form) => ({
  preu: form.preu === '' ? null : Number(form.preu),
  condicions: form.condicions.trim(),
  distribuidoraId: form.distribuidoraId,
});

export const internaHaCanviat = (actual, inicial) => Boolean(actual && inicial) && CAMPS.some((camp) => actual[camp] !== inicial[camp]);
