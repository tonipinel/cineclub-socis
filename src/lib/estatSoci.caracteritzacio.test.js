import { describe, it, expect } from 'vitest';
import * as ara from './estatSoci';
// Còpia literal d'src/lib/estatSoci.js a 9600755 (la versió en producció abans de la renovació sempre encadenada).
import * as abans from './__fixtures__/estatSoci-9600755';
import { dadesInicials } from '../../scripts/arnes-admin/dades';
import { comparar } from '../../scripts/informe-renovacions.mjs';

// Caracterització: cap fitxa ni moviment desats fins avui té `modeVigencia` ni `reiniciQuota`, i per a aquestes dades
// la regla nova ha de donar exactament el mateix que la de 9600755 (venciment, estat, dies, activació a l'escaneig,
// períodes de l'historial i sincronització). Només canvien els pagaments que es registrin a partir d'ara.

// Formes de fitxa i historial que hi ha (o hi pot haver) a producció, amb dates absolutes.
const q = (numeroSoci, data, extra = {}) => ({ categoria: 'Quotes socis', tipus: 'ingres', numeroSoci, data, ...extra });
const FIXTURES = [
  // Importats de l'Excel (amb i sense quotes reconstruïdes), activats o no.
  [{ numeroSoci: 1, ultimPagament: '2025-10-01', notaImportacio: 'x', actiu: true }, []],
  [{ numeroSoci: 2, ultimPagament: '2025-08-29', inicPeriode: '2025-09-12', notaImportacio: 'x', actiu: true }, [q(2, '2025-08-29', { tipusQuota: 'alta' })]],
  [{ numeroSoci: 3, ultimPagament: '2024-09-15', notaImportacio: 'x', actiu: true }, [q(3, '2024-09-15', { tipusQuota: 'alta' })]],
  // Sol·licitud aprovada encara sense pagar (data provisional) i fitxa nova sense número.
  [{ numeroSoci: 4, ultimPagament: '2026-10-20', actiu: true }, []],
  [{ numeroSoci: '', ultimPagament: '2026-10-22', actiu: true }, []],
  // Alta + renovació antiga (desada amb el venciment com a data), amb activació.
  [{ numeroSoci: 5, ultimPagament: '2026-09-01', inicPeriode: '2026-09-05', actiu: true },
    [q(5, '2025-09-01', { tipusQuota: 'alta' }), q(5, '2026-09-01', { tipusQuota: 'renovacio' })]],
  // Bug d'abans: escaneig previ a la data pagada.
  [{ numeroSoci: 6, ultimPagament: '2026-12-01', inicPeriode: '2026-11-02', actiu: true },
    [q(6, '2025-12-01'), q(6, '2026-12-01', { tipusQuota: 'renovacio' })]],
  // Renovació anticipada desada per 9600755 (vigenciaDes + vencimentAnterior), abans i després de l'activació.
  [{ numeroSoci: 7, ultimPagament: '2026-10-20', vigenciaDes: '2026-12-03', inicPeriode: null, actiu: true },
    [q(7, '2025-11-15', { tipusQuota: 'alta' }), q(7, '2026-10-20', { tipusQuota: 'renovacio', vencimentAnterior: '2026-12-03' })]],
  [{ numeroSoci: 8, ultimPagament: '2025-10-20', vigenciaDes: '2025-12-03', inicPeriode: '2025-12-20', actiu: true },
    [q(8, '2024-11-15', { tipusQuota: 'alta' }), q(8, '2025-10-20', { tipusQuota: 'renovacio', vencimentAnterior: '2025-12-03' })]],
  // Alta desada per 9600755 sobre una data provisional.
  [{ numeroSoci: 9, ultimPagament: '2026-10-25', vigenciaDes: '2026-10-25', actiu: true }, [q(9, '2026-10-25', { tipusQuota: 'alta' })]],
  // Desactivats, pendent manual, vençuts, 29 de febrer, sense camp actiu.
  [{ numeroSoci: 10, ultimPagament: '2025-03-01', actiu: false, motiuDesactivacio: 'baixa', dataDesactivacio: '2025-06-01' }, [q(10, '2025-03-01')]],
  [{ numeroSoci: 11, ultimPagament: '2026-02-01', estatManual: 'pendent', actiu: true }, [q(11, '2026-02-01')]],
  [{ numeroSoci: 12, ultimPagament: '2023-05-05', inicPeriode: '2023-06-01' }, [q(12, '2023-05-05')]],
  [{ numeroSoci: 13, ultimPagament: '2024-02-29', actiu: true }, [q(13, '2024-02-29')]],
  [{ numeroSoci: 14, ultimPagament: '2025-12-31', inicPeriode: '2026-01-02', actiu: true }, [q(14, '2024-12-31'), q(14, '2025-12-31')]],
];

// Dades llegades aleatòries però reproduïbles (sense modeVigencia ni reiniciQuota).
function generador(llavor) {
  let x = llavor;
  return () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
}
function dataAleatoria(r, desDe = 2023) {
  return new Date(desDe + Math.floor(r() * 4), Math.floor(r() * 12), 1 + Math.floor(r() * 28)).toLocaleDateString('sv-SE');
}
function sumarDies(data, dies) {
  const [a, m, d] = data.split('-').map(Number);
  return new Date(a, m - 1, d + dies).toLocaleDateString('sv-SE');
}
function aleatoris(n) {
  const r = generador(20261025);
  return Array.from({ length: n }, (_, i) => {
    const quotes = Array.from({ length: Math.floor(r() * 4) }, () => {
      const data = dataAleatoria(r);
      return q(100 + i, data, r() < 0.4 ? { vencimentAnterior: sumarDies(data, Math.floor(r() * 300)) } : {});
    });
    const ultimPagament = dataAleatoria(r);
    const soci = { numeroSoci: r() < 0.9 ? 100 + i : '', ultimPagament, actiu: r() < 0.85 };
    if (r() < 0.5) soci.inicPeriode = sumarDies(ultimPagament, Math.floor(r() * 120) - 40);
    if (r() < 0.3) soci.vigenciaDes = sumarDies(ultimPagament, Math.floor(r() * 200));
    if (r() < 0.1) soci.estatManual = 'pendent';
    return [soci, quotes];
  });
}

function arnes() {
  const dades = dadesInicials();
  const socis = Object.entries(dades).filter(([c]) => c.startsWith('socis/')).map(([, s]) => s);
  const moviments = Object.entries(dades).filter(([c]) => c.startsWith('moviments/')).map(([id, m]) => ({ id, ...m }));
  return socis.map((s) => [s, moviments.filter((m) => m.categoria === 'Quotes socis' && Number(m.numeroSoci) === Number(s.numeroSoci))]);
}

const iso = (d) => d.toLocaleDateString('sv-SE');
const DIES = [new Date(2026, 9, 25), new Date(2026, 0, 1), new Date(2027, 11, 31, 23, 30), new Date()];

function resultat(m, soci, quotes) {
  if (!soci.ultimPagament) return null;
  return {
    venciment: iso(m.calcularVenciment(soci)),
    iniciPeriode: m.iniciPeriodeActual(soci),
    estats: DIES.map((d) => m.calcularEstatSoci(soci, d)),
    dies: DIES.map((d) => m.diesFinsVenciment(soci, d)),
    escaneig: DIES.map((d) => m.inicPeriodeEnEscanejar(soci, iso(d))),
    periodes: m.calcularPeriodes(quotes, { inicPeriode: soci.inicPeriode }),
    sincronitzacio: m.sincronitzacioQuotes(soci, quotes),
  };
}

describe('caracterització: les dades desades fins avui no canvien', () => {
  it.each([
    ['fixtures amb les formes de producció', FIXTURES],
    ['els 60 socis i les quotes de l\'arnès', arnes()],
    ['500 fitxes i historials aleatoris de dades llegades', aleatoris(500)],
  ])('%s: mateix venciment, estat, activació, períodes i sincronització que 9600755', (_nom, casos) => {
    for (const [soci, quotes] of casos) {
      expect(resultat(ara, soci, quotes), JSON.stringify(soci)).toEqual(resultat(abans, soci, quotes));
    }
  });

  it('l\'informe de només lectura no hi veu cap canvi nou', () => {
    const socis = FIXTURES.map(([s]) => s);
    const moviments = FIXTURES.flatMap(([, qs]) => qs);
    // Només el bug de l'escaneig previ a la data pagada (soci 6), que ja hi sortia amb 9600755.
    expect(comparar(socis, moviments).canvis.map((c) => c.numeroSoci)).toEqual([6]);
  });
});
