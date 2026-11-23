import {
  aportacioPrevista, calcularSaldos, costsPendentsDeFactura, CATEGORIA_QUOTA_SOCI, TIPUS_MOVIMENT,
} from './moviments';
import { sessionsAmbControl } from './sessions';

const NOMS_CURTS = ['Gen', 'Feb', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Des'];
const esNombre = (v) => typeof v === 'number' && Number.isFinite(v);

const aData = (dataStr) => {
  const [a, m, d] = dataStr.split('-').map(Number);
  return new Date(a, m - 1, d);
};
const aStr = (data) => data.toLocaleDateString('sv-SE');
export const etiquetaMes = (data) => `${NOMS_CURTS[data.getMonth()]} ${String(data.getFullYear()).slice(2)}`;

// Rang de l'eix de temps: 12 mesos reals (el d'avui inclòs) + 12 de previsió, de l'1 del primer al darrer dia de l'últim,
// i una etiqueta (dia 15) per mes.
export function rangEvolucio(avui) {
  const mesos = 12 + 12;
  const primer = avui.getMonth() - 11;
  return {
    domini: [new Date(avui.getFullYear(), primer, 1).getTime(), new Date(avui.getFullYear(), primer + mesos, 0).getTime()],
    ticks: Array.from({ length: mesos }, (_, i) => mitjaMes(avui.getFullYear(), primer + i)),
  };
}

// Dia 15 de cada mes: on es dibuixa l'etiqueta del mes i el punt dels mesos sense sessions.
export const mitjaMes = (any, mes) => new Date(any, mes, 15).getTime();

// Punts del gràfic d'evolució econòmica, en ordre de data. Als mesos amb sessions hi ha un punt per sessió (real i previst);
// als mesos sense sessions, un sol punt al mig del mes (real, o estimat si és futur).
// `real` = resumReal(...), `previsio` = resumPrevisio(...). Retorna files `{ t, titol, etiqueta, tresoreriaReal, seriePropia, <sèries> }`.
export function puntsEvolucio({
  moviments, sessions, costsReals, real, previsio, avui,
}) {
  const dataAvui = aStr(avui);
  const amb = sessionsAmbControl(sessions).filter((s) => s.data);
  const files = [];

  // --- Real ---
  const ultim = real.mesos[real.mesos.length - 1];
  real.mesos.forEach((mes, k) => {
    const inici = new Date(avui.getFullYear(), avui.getMonth() - (real.mesos.length - 1 - k), 1);
    const iniciStr = aStr(inici);
    const fiStr = aStr(new Date(inici.getFullYear(), inici.getMonth() + 1, 1));
    const delMes = amb.filter((s) => s.data >= iniciStr && s.data < fiStr && s.data <= dataAvui).sort((a, b) => a.data.localeCompare(b.data));
    const actual = k === real.mesos.length - 1;
    delMes.forEach((s) => {
      const pendent = costsPendentsDeFactura(moviments, amb, costsReals, s.data).reduce((acc, p) => acc + p.cost, 0);
      const tresoreria = calcularSaldos(moviments.filter((m) => (m.data ?? '') <= s.data)).excedent - pendent;
      files.push({ t: aData(s.data).getTime(), titol: s.publica?.titol || s.titol || '', etiqueta: s.data, finsA: s.data, tresoreriaReal: tresoreria, seriePropia: null });
    });
    if (actual) {
      const fiMes = aStr(new Date(inici.getFullYear(), inici.getMonth() + 1, 0));
      if (!files.some((f) => f.etiqueta === dataAvui)) files.push({ t: aData(dataAvui).getTime(), titol: '', etiqueta: 'Avui', finsA: fiMes, tresoreriaReal: mes.tresoreria, seriePropia: null });
      else Object.assign(files[files.length - 1], { tresoreriaReal: mes.tresoreria, finsA: fiMes });
    } else if (delMes.length === 0) {
      files.push({ t: mitjaMes(inici.getFullYear(), inici.getMonth()), titol: '', etiqueta: mes.etiqueta, finsA: aStr(new Date(inici.getFullYear(), inici.getMonth() + 1, 0)), tresoreriaReal: mes.tresoreria, seriePropia: null });
    }
  });

  // Detall de cada punt real: el que ha entrat i sortit des del punt anterior (quotes, entrades, pel·lícula; la resta, a «altres»).
  const inici0 = new Date(avui.getFullYear(), avui.getMonth() - (real.mesos.length - 1), 1);
  let anterior = aStr(new Date(inici0.getFullYear(), inici0.getMonth(), 0));
  let valorAnterior = calcularSaldos(moviments.filter((m) => (m.data ?? '') <= anterior)).excedent;
  files.forEach((f) => {
    const interval = moviments.filter((m) => (m.data ?? '') > anterior && (m.data ?? '') <= f.finsA);
    const suma = (llista) => llista.reduce((acc, m) => acc + (Number(m.total) || 0), 0);
    const quotes = interval.filter((m) => m.categoria === CATEGORIA_QUOTA_SOCI && m.tipus === TIPUS_MOVIMENT.INGRES);
    const aportacions = suma(interval.filter((m) => m.categoria === 'Aportacions' && m.tipus === TIPUS_MOVIMENT.INGRES));
    const pendentsInterval = costsPendentsDeFactura(moviments, amb, costsReals, f.finsA).filter((p) => p.data > anterior);
    const cost = suma(interval.filter((m) => m.categoria === 'Gestió pel·lícules' && m.tipus === TIPUS_MOVIMENT.DESPESA))
      + pendentsInterval.reduce((acc, p) => acc + p.cost, 0);
    const variacio = f.tresoreriaReal - valorAnterior;
    const importQuotes = suma(quotes);
    f.detall = {
      quotes: quotes.length, importQuotes, aportacions, cost, altres: variacio - (importQuotes + aportacions - cost), variacio,
    };
    anterior = f.finsA;
    valorAnterior = f.tresoreriaReal;
  });

  // --- Previsió: [{ fila, valor, precis }] ---
  const futures = amb.filter((s) => s.data > dataAvui).sort((a, b) => a.data.localeCompare(b.data));
  const costDe = (s) => (esNombre(costsReals?.[s.id]) ? costsReals[s.id] : previsio.costPellicula);
  const precisDe = (s) => esNombre(costsReals?.[s.id]);
  const nous = [];
  let acumulat = ultim.tresoreria;
  const inicisMesSeguent = new Date(avui.getFullYear(), avui.getMonth() + 1, 1);
  futures.filter((s) => s.data < aStr(inicisMesSeguent)).forEach((s) => {
    const aportacions = aportacioPrevista(s, previsio);
    acumulat += aportacions - costDe(s);
    nous.push({
      t: aData(s.data).getTime(), titol: s.publica?.titol || s.titol || '', etiqueta: s.data, valor: acumulat, precis: precisDe(s),
      detall: {
        quotes: 0, importQuotes: 0, aportacions, cost: costDe(s), altres: 0, variacio: aportacions - costDe(s),
      },
    });
  });
  previsio.mesos.forEach((mes, i) => {
    const inici = new Date(avui.getFullYear(), avui.getMonth() + 1 + i, 1);
    const iniciStr = aStr(inici);
    const fiStr = aStr(new Date(inici.getFullYear(), inici.getMonth() + 1, 1));
    const delMes = futures.filter((s) => s.data >= iniciStr && s.data < fiStr);
    if (delMes.length === 0) {
      acumulat += mes.impacteNet;
      nous.push({
        t: mitjaMes(inici.getFullYear(), inici.getMonth()), titol: '', etiqueta: mes.etiqueta, valor: acumulat, precis: false,
        detall: {
          quotes: mes.novesAltes + mes.renovacionsEsperades, importQuotes: mes.ingressosQuotes, aportacions: mes.ingressosAportacions, cost: mes.costPellicula, altres: 0, variacio: mes.impacteNet,
        },
      });
      return;
    }
    delMes.forEach((s, j) => {
      const quotes = j === 0 ? mes.novesAltes + mes.renovacionsEsperades : 0;
      const importQuotes = j === 0 ? mes.ingressosQuotes : 0;
      const aportacions = aportacioPrevista(s, previsio);
      acumulat += aportacions - costDe(s) + importQuotes;
      nous.push({
        t: aData(s.data).getTime(), titol: s.publica?.titol || s.titol || '', etiqueta: s.data, valor: acumulat, precis: precisDe(s),
        detall: {
          quotes, importQuotes, aportacions, cost: costDe(s), altres: 0, variacio: aportacions - costDe(s) + importQuotes,
        },
      });
    });
  });

  // Cada tram del mateix color té la seva sèrie (alternant dues per color) perquè dos trams no se superposin; el punt de canvi
  // es repeteix com a primer punt del tram següent. L'últim punt real és el de partida de la previsió.
  const clauSerie = (precis, tram) => `${precis ? 'tresoreriaPrevistaPrecisa' : 'tresoreriaPrevista'}${Math.floor(tram / 2) % 2 === 0 ? '' : '2'}`;
  const filaAvui = files[files.length - 1];
  const punts = [{ fila: filaAvui, valor: ultim.tresoreria, precis: nous[0]?.precis ?? false }];
  nous.forEach((p) => {
    const { valor, precis, ...resta } = p;
    const fila = { ...resta, tresoreriaReal: null, seriePropia: null };
    files.push(fila);
    punts.push({ fila, valor, precis });
  });
  let tram = 0;
  punts.forEach((punt, i) => {
    if (i > 0 && punts[i - 1].precis !== punt.precis) {
      tram += 1;
      punts[i - 1].fila[clauSerie(punt.precis, tram)] = punts[i - 1].valor;
    }
    const clau = clauSerie(punt.precis, tram);
    punt.fila[clau] = punt.valor;
    punt.fila.seriePropia = clau;
  });
  return files;
}
