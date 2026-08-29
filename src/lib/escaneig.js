export function identificarCodi(codi) {
  const text = (codi ?? '').trim();

  const matchSoci = text.match(/^SOCI-(\d+)$/);
  if (matchSoci) return { tipus: 'soci', numeroSoci: Number(matchSoci[1]) };

  const matchTiquet = text.match(/^(L[12]-\d{3})$/);
  if (matchTiquet) return { tipus: 'generic', codiTiquet: matchTiquet[1] };

  return { tipus: 'desconegut' };
}

export function codisDeLot(lot) {
  const prefix = lot === 'lot2' ? 'L2' : 'L1';
  return Array.from({ length: 150 }, (_, i) => `${prefix}-${String(i + 1).padStart(3, '0')}`);
}

export function resumAccessLog(entrades) {
  const numerosSociDistints = new Set(
    entrades.filter((e) => e.tipus === 'soci').map((e) => e.numeroSoci)
  );
  const entradesGeneriques = entrades.filter((e) => e.tipus === 'generic');
  const importGeneric = entradesGeneriques.reduce((total, e) => total + (e.preuAplicat ?? 0), 0);
  return {
    socisDistints: numerosSociDistints.size,
    entradesGeneriques: entradesGeneriques.length,
    importGeneric,
  };
}
