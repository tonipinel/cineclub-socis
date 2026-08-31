export function identificarCodi(codi) {
  const text = (codi ?? '').trim();

  const matchSoci = text.match(/^SOCI-(\d+)$/);
  if (matchSoci) return { tipus: 'soci', numeroSoci: Number(matchSoci[1]) };

  const matchTiquet = text.match(/^(T-\d{6,})$/);
  if (matchTiquet) return { tipus: 'generic', codiTiquet: matchTiquet[1] };

  return { tipus: 'desconegut' };
}

export function codisDesDe(seguentNumero, quantitat) {
  return Array.from({ length: quantitat }, (_, i) => `T-${String(seguentNumero + i).padStart(6, '0')}`);
}

export function trobarLotDelCodi(codi, lots) {
  const match = (codi ?? '').match(/^T-(\d+)$/);
  if (!match) return [];
  const numero = Number(match[1]);
  return lots.filter((l) => numero >= l.numeroInicial && numero < l.numeroInicial + l.quantitat);
}

export function tiquetEstaAnulat(codi, lots) {
  const lotsCoincidents = trobarLotDelCodi(codi, lots);
  return lotsCoincidents.some((lot) => lot.anulat || (lot.codisAnulats ?? []).includes(codi));
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
  const sessionsPerSoci = new Map();
  for (const e of entrades) {
    if (e.tipus !== 'soci') continue;
    if (!(e.data instanceof Date) || e.data < faDotzeMesos) continue;
    if (!sessionsPerSoci.has(e.numeroSoci)) sessionsPerSoci.set(e.numeroSoci, new Set());
    sessionsPerSoci.get(e.numeroSoci).add(e.sessionId);
  }
  const comptador = {};
  for (const [numeroSoci, sessions] of sessionsPerSoci) {
    comptador[numeroSoci] = sessions.size;
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

export function resumDashboardTiquets(lots, entradesAccessLog, sessions, avui = new Date()) {
  let disponibles = 0;
  for (const lot of lots) {
    if (lot.anulat) continue;
    const codisAnulats = new Set(lot.codisAnulats ?? []);
    for (const { codi, usat } of tiquetsDelLot(lot, entradesAccessLog)) {
      if (!usat && !codisAnulats.has(codi)) disponibles += 1;
    }
  }

  const dataAvui = avui.toLocaleDateString('sv-SE');
  const ultimaSessio = [...sessions]
    .filter((s) => (s.data ?? '') <= dataAvui)
    .sort((a, b) => (b.data ?? '').localeCompare(a.data ?? ''))[0];
  const gastatsUltimaSessio = ultimaSessio
    ? entradesAccessLog.filter((e) => e.tipus === 'generic' && e.sessionId === ultimaSessio.id).length
    : 0;

  return { disponibles, gastatsUltimaSessio };
}

export function entradesPerFranjaHoraria(entrades) {
  const comptador = new Map();
  for (const entrada of entrades) {
    const data = entrada.timestamp?.toDate?.();
    if (!data) continue;
    const minutsArrodonits = Math.floor(data.getMinutes() / 30) * 30;
    const franja = `${String(data.getHours()).padStart(2, '0')}:${String(minutsArrodonits).padStart(2, '0')}`;
    comptador.set(franja, (comptador.get(franja) ?? 0) + 1);
  }
  return [...comptador.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([franja, total]) => ({ franja, total }));
}
