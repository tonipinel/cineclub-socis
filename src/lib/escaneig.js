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

export function assistenciaPerSessio(sessions, entradesSoci) {
  const sessionsAssistides = new Set(entradesSoci.map((e) => e.sessionId));
  return [...sessions]
    .sort((a, b) => (b.data ?? '').localeCompare(a.data ?? ''))
    .map((s) => ({ ...s, assisteix: sessionsAssistides.has(s.id) }));
}

export function comptarAssistenciesRecents(entrades, avui = new Date()) {
  const faDotzeMesos = new Date(avui);
  faDotzeMesos.setMonth(faDotzeMesos.getMonth() - 12);
  const comptador = {};
  for (const e of entrades) {
    if (e.tipus !== 'soci') continue;
    if (!(e.data instanceof Date) || e.data < faDotzeMesos) continue;
    comptador[e.numeroSoci] = (comptador[e.numeroSoci] ?? 0) + 1;
  }
  return comptador;
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
