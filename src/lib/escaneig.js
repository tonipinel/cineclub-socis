export function identificarCodi(codi) {
  const text = (codi ?? '').trim();

  const matchSoci = text.match(/^SOCI-(\d+)$/);
  if (matchSoci) return { tipus: 'soci', numeroSoci: Number(matchSoci[1]) };

  const matchTiquet = text.match(/^(L[12]-\d{3}|T-\d{6,})$/);
  if (matchTiquet) return { tipus: 'generic', codiTiquet: matchTiquet[1] };

  return { tipus: 'desconegut' };
}

export function codisDeLot(lot) {
  const prefix = lot === 'lot2' ? 'L2' : 'L1';
  return Array.from({ length: 150 }, (_, i) => `${prefix}-${String(i + 1).padStart(3, '0')}`);
}

export function codisDesDe(seguentNumero, quantitat) {
  return Array.from({ length: quantitat }, (_, i) => `T-${String(seguentNumero + i).padStart(6, '0')}`);
}

export function trobarLotDelCodi(codi, lots) {
  const match = (codi ?? '').match(/^T-(\d+)$/);
  if (!match) return null;
  const numero = Number(match[1]);
  return lots.find((l) => numero >= l.numeroInicial && numero < l.numeroInicial + l.quantitat) ?? null;
}

export function tiquetEstaAnulat(codi, lots) {
  const lot = trobarLotDelCodi(codi, lots);
  if (!lot) return false;
  if (lot.anulat) return true;
  return (lot.codisAnulats ?? []).includes(codi);
}

export function tiquetsDelLot(lot, entradesGeneriques) {
  const usats = new Set(
    entradesGeneriques.filter((e) => e.tipus === 'generic').map((e) => e.codiTiquet)
  );
  return codisDesDe(lot.numeroInicial, lot.quantitat).map((codi) => ({ codi, usat: usats.has(codi) }));
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

export function resumPerSessio(entrades) {
  const grups = {};
  for (const entrada of entrades) {
    if (!entrada.sessionId) continue;
    (grups[entrada.sessionId] ??= []).push(entrada);
  }
  const resultat = {};
  for (const [sessionId, entradesSessio] of Object.entries(grups)) {
    resultat[sessionId] = resumAccessLog(entradesSessio);
  }
  return resultat;
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
