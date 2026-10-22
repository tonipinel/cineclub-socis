const aMs = (valor) => (typeof valor?.toDate === 'function' ? valor.toDate() : valor)?.getTime() ?? 0;

// Mateix criteri que el servidor (functions/votacio-handlers.js): la tanda oberta (`tanca` > ara) amb
// `creada` més recent; si no n'hi ha cap, la darrera tancada per `tanca`.
export function triaTanda(tandes, ara) {
  const obertes = tandes.filter((t) => aMs(t.tanca) > ara.getTime());
  if (obertes.length > 0) return obertes.reduce((a, b) => (aMs(b.creada) > aMs(a.creada) ? b : a));
  if (tandes.length === 0) return null;
  return tandes.reduce((a, b) => (aMs(b.tanca) > aMs(a.tanca) ? b : a));
}
