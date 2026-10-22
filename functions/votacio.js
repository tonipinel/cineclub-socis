const VALORS = ['like', 'dislike'];

function error(codi, missatge) {
  return Object.assign(new Error(missatge), { codi });
}

const ESTATS_EFECTIUS = ['aprovada', 'programada'];

function propostesEfectives(tanda, propostesPerId) {
  return tanda.propostes.filter((id) => ESTATS_EFECTIUS.includes(propostesPerId[id]?.estat));
}

function estaTancada(tanda, ara) {
  const tanca = typeof tanda.tanca.toDate === 'function' ? tanda.tanca.toDate() : tanda.tanca;
  return tanca <= ara;
}

function aplicarVot(votActual, propostaId, valor, efectives, { tancada }) {
  if (tancada) throw error('failed-precondition', 'La tanda és tancada.');
  if (votActual?.bloquejat) throw error('failed-precondition', 'El vot ja està bloquejat.');
  if (!efectives.includes(propostaId)) throw error('invalid-argument', 'Proposta no vàlida.');
  if (!VALORS.includes(valor)) throw error('invalid-argument', 'Valor no vàlid.');
  return {
    valors: { ...votActual?.valors, [propostaId]: valor },
    bloquejat: votActual?.bloquejat ?? false,
  };
}

function estaCompleta(valors, efectives) {
  return efectives.every((id) => VALORS.includes(valors[id]));
}

function calcularRanking(votsDocs, efectives, { minim = 5 } = {}) {
  return efectives
    .map((propostaId, ordre) => {
      let likes = 0;
      let total = 0;
      for (const { valors } of votsDocs) {
        const valor = valors?.[propostaId];
        if (!VALORS.includes(valor)) continue;
        total += 1;
        if (valor === 'like') likes += 1;
      }
      const percentatge = total >= minim ? Math.round((100 * likes) / total) : null;
      return { propostaId, percentatge, ordre };
    })
    .sort((a, b) => {
      if (a.percentatge === null || b.percentatge === null) {
        return (a.percentatge === null) - (b.percentatge === null) || a.ordre - b.ordre;
      }
      return b.percentatge - a.percentatge || a.ordre - b.ordre;
    })
    .map(({ propostaId, percentatge }) => ({ propostaId, percentatge }));
}

module.exports = { propostesEfectives, estaTancada, aplicarVot, estaCompleta, calcularRanking };
