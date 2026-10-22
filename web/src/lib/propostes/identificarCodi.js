export function identificarCodi(codi) {
  const text = (codi ?? '').trim();

  const matchSoci = text.match(/^SOCI-(\d+)$/);
  if (matchSoci) return { tipus: 'soci', numeroSoci: Number(matchSoci[1]) };

  const matchCarnet = text.match(/^CARNET-(.+)$/);
  if (matchCarnet) return { tipus: 'carnet-token', token: matchCarnet[1] };

  const matchTiquet = text.match(/^(T-\d{6,})$/);
  if (matchTiquet) return { tipus: 'generic', codiTiquet: matchTiquet[1] };

  return { tipus: 'desconegut' };
}
