import { describe, it, expect } from 'vitest';
import { puntsEvolucio, rangEvolucio } from './evolucioEconomica';
import { resumReal, resumPrevisio } from './moviments';

const avui = new Date(2026, 10, 23); // 23/11/2026
const sessio = (id, data, titol) => ({ id, data, titol, publica: { titol } });

function calcula({ moviments = [], sessions = [], costsReals = {} }) {
  const real = resumReal(moviments, avui, { sessions, costsReals });
  const previsio = resumPrevisio(moviments, [], sessions, [], avui, { costsReals });
  return puntsEvolucio({ moviments, sessions, costsReals, real, previsio, avui });
}

describe('puntsEvolucio', () => {
  it('als mesos amb sessions hi ha un punt per sessió, amb el títol de la pel·lícula; sense sessions, un punt al mig del mes', () => {
    const moviments = [{ data: '2026-10-01', tipus: 'ingres', categoria: 'Aportacions', metodePagament: 'efectiu', total: 100 }];
    const files = calcula({ moviments, sessions: [sessio('a', '2026-10-08', 'Abejas'), sessio('b', '2026-10-22', 'Night')] });
    const real = files.filter((f) => f.tresoreriaReal !== null);
    expect(real.filter((f) => f.titol).map((f) => f.titol)).toEqual(['Abejas', 'Night']);
    const octubre = real.filter((f) => new Date(f.t).getMonth() === 9);
    expect(octubre).toHaveLength(2); // cap punt mensual afegit
    const setembre = real.filter((f) => new Date(f.t).getMonth() === 8);
    expect(setembre).toHaveLength(1);
    expect(new Date(setembre[0].t).getDate()).toBe(15);
    expect(setembre[0].titol).toBe('');
  });

  it('una sessió feta sense factura resta el cost conegut a partir de la seva data', () => {
    const moviments = [{ data: '2026-10-01', tipus: 'ingres', categoria: 'Aportacions', metodePagament: 'efectiu', total: 500 }];
    const files = calcula({ moviments, sessions: [sessio('j', '2026-11-05', 'Jura')], costsReals: { j: 217.8 } });
    const jura = files.find((f) => f.titol === 'Jura');
    expect(jura.tresoreriaReal).toBeCloseTo(282.2);
    expect(files.find((f) => f.etiqueta === 'Avui').tresoreriaReal).toBeCloseTo(282.2);
  });

  it('les sessions futures són punts previstos (cost conegut) amb el seu títol, i l\'últim punt real els hi enllaça', () => {
    const files = calcula({ sessions: [sessio('f', '2026-12-10', 'Futura')], costsReals: { f: 100 } });
    const futura = files.find((f) => f.titol === 'Futura');
    expect(futura.seriePropia).toMatch(/^tresoreriaPrevistaPrecisa/);
    const avuiFila = files.find((f) => f.etiqueta === 'Avui');
    expect(avuiFila.tresoreriaPrevistaPrecisa).toBe(avuiFila.tresoreriaReal);
  });

  it('els mesos futurs sense sessions són un sol punt estimat al mig del mes', () => {
    const files = calcula({ sessions: [sessio('f', '2026-12-10', 'Futura')], costsReals: { f: 100 } });
    const gener = files.find((f) => f.etiqueta === 'Gener 2027');
    expect(gener.titol).toBe('');
    expect(new Date(gener.t).getDate()).toBe(15);
    expect(gener.seriePropia).toMatch(/^tresoreriaPrevista(2)?$/);
  });

  it('el total de la previsió coincideix amb el de la previsió mensual', () => {
    const sessions = [sessio('f', '2026-12-10', 'A'), sessio('g', '2026-12-20', 'B')];
    const costsReals = { f: 100, g: 50 };
    const files = calcula({ sessions, costsReals });
    const previsio = resumPrevisio([], [], sessions, [], avui, { costsReals });
    const real = resumReal([], avui, { sessions, costsReals });
    const esperat = real.mesos.at(-1).tresoreria + previsio.restaMesActual.impacteNet + previsio.impacteNetAcumulat;
    const ultim = files.at(-1);
    expect(ultim[ultim.seriePropia]).toBeCloseTo(esperat);
  });

  it('les files van en ordre de data', () => {
    const files = calcula({ sessions: [sessio('a', '2026-10-08', 'A'), sessio('f', '2026-12-10', 'F')], costsReals: { f: 1 } });
    const ts = files.map((f) => f.t);
    expect(ts).toEqual([...ts].sort((x, y) => x - y));
  });

  it('cada punt porta el detall: quotes, entrades, cost de pel·lícula i la variació respecte al punt anterior', () => {
    const moviments = [
      { data: '2026-10-02', tipus: 'ingres', categoria: 'Quotes socis', metodePagament: 'efectiu', total: 30 },
      { data: '2026-10-05', tipus: 'ingres', categoria: 'Quotes socis', metodePagament: 'efectiu', total: 30 },
      { data: '2026-10-08', tipus: 'ingres', categoria: 'Aportacions', metodePagament: 'efectiu', sessionId: 'a', total: 70 },
      { data: '2026-10-09', tipus: 'despesa', categoria: 'Gestió pel·lícules', metodePagament: 'efectiu', sessionId: 'a', total: 100 },
      { data: '2026-10-10', tipus: 'despesa', categoria: 'Gestió associació', metodePagament: 'efectiu', total: 5 },
    ];
    const files = calcula({ moviments, sessions: [sessio('a', '2026-10-08', 'Abejas'), sessio('b', '2026-10-22', 'Night')] });
    const abejas = files.find((f) => f.titol === 'Abejas');
    expect(abejas.detall).toMatchObject({ quotes: 2, importQuotes: 60, aportacions: 70, cost: 0, altres: 0 });
    const night = files.find((f) => f.titol === 'Night');
    expect(night.detall).toMatchObject({ quotes: 0, aportacions: 0, cost: 100, altres: -5 });
    expect(night.detall.variacio).toBe(night.tresoreriaReal - abejas.tresoreriaReal);
  });

  it('els punts previstos porten el detall: quotes esperades només a la primera sessió del mes, i la variació quadra amb la tresoreria', () => {
    const sessions = [sessio('f', '2026-12-10', 'A'), sessio('g', '2026-12-20', 'B')];
    const files = calcula({ sessions, costsReals: { f: 100, g: 50 } });
    const a = files.find((f) => f.titol === 'A');
    const b = files.find((f) => f.titol === 'B');
    expect(a.detall.cost).toBe(100);
    expect(b.detall.cost).toBe(50);
    expect(b.detall.quotes).toBe(0);
    const valor = (f) => f[f.seriePropia];
    expect(valor(b) - valor(a)).toBeCloseTo(b.detall.variacio);
  });

  it('les quotes previstes són enteres i l\'import és quotes × import de la quota (1 quota = 30 €)', () => {
    const alta = (data) => ({ data, tipus: 'ingres', categoria: 'Quotes socis', metodePagament: 'efectiu', total: 30 });
    const sessions = [sessio('f', '2026-12-10', 'A')];
    const files = calcula({ moviments: [alta('2026-10-05'), alta('2026-10-06')], sessions, costsReals: { f: 10 } });
    const previsions = files.filter((f) => f.tresoreriaReal === null);
    previsions.forEach((f) => {
      expect(Number.isInteger(f.detall.quotes)).toBe(true);
      expect(f.detall.importQuotes).toBeCloseTo(f.detall.quotes * 30);
    });
    expect(files.find((f) => f.titol === 'A').detall).toMatchObject({ quotes: 1, importQuotes: 30 }); // 0,67 altes al mes → 1
  });

  it('amb poques altes (0,33 al mes) la previsió té una quota cada tres mesos, no fraccions', () => {
    const moviments = [{ data: '2026-10-05', tipus: 'ingres', categoria: 'Quotes socis', metodePagament: 'efectiu', total: 30 }];
    const previsio = resumPrevisio(moviments, [], [], [], avui);
    const altes = previsio.mesos.map((m) => m.novesAltes);
    expect(altes.every(Number.isInteger)).toBe(true);
    expect(altes.reduce((a, b) => a + b, 0)).toBe(4); // 12 mesos × 0,33
    expect(previsio.mesos[1].ingressosQuotes).toBe(30);
  });

  it('el rang de l\'eix cobreix els 24 mesos (12 reals + 12 de previsió) de l\'1 del primer al darrer dia de l\'últim, amb una etiqueta per mes', () => {
    const { domini, ticks } = rangEvolucio(avui);
    expect(domini[0]).toBe(new Date(2025, 11, 1).getTime()); // Desembre 2025 és l'11è mes enrere
    expect(domini[1]).toBe(new Date(2027, 10, 30).getTime()); // 12 mesos després de novembre 2026
    expect(ticks).toHaveLength(24);
    expect(ticks[0]).toBe(new Date(2025, 11, 15).getTime());
    expect(ticks[23]).toBe(new Date(2027, 10, 15).getTime());
  });

  it('una sessió del primer mes real abans del dia 15 i una de l\'últim mes previst després del 15 entren dins el rang', () => {
    const sessions = [sessio('a', '2025-12-03', 'Primera'), sessio('z', '2027-11-28', 'Darrera')];
    const files = calcula({ sessions, costsReals: { z: 10 } });
    const { domini } = rangEvolucio(avui);
    files.forEach((f) => { expect(f.t).toBeGreaterThanOrEqual(domini[0]); expect(f.t).toBeLessThanOrEqual(domini[1]); });
    expect(files.some((f) => f.titol === 'Primera')).toBe(true);
    expect(files.some((f) => f.titol === 'Darrera')).toBe(true);
  });
});
