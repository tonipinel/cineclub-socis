import { describe, it, expect } from 'vitest';
import {
  calcularEstatSoci, calcularPeriodes, calcularVenciment, diesFinsVenciment, iniciPeriodeActual, iniciVigencia,
  inicPeriodeEnEscanejar, novaQuota, sincronitzacioQuotes, ESTAT_AL_DIA, ESTAT_PENDENT, ESTAT_VENCUT, ESTAT_NOU_REGISTRE,
} from './estatSoci';
import { dadesInicials } from '../../scripts/arnes-admin/dades';

describe('calcularEstatSoci', () => {
  it('retorna Al dia quan fa menys d\'un any del darrer pagament', () => {
    const soci = { numeroSoci: '1', ultimPagament: '2026-01-01' };
    expect(calcularEstatSoci(soci, new Date('2026-06-01'))).toBe(ESTAT_AL_DIA);
  });

  it('retorna Vençut quan ha passat més d\'un any del darrer pagament', () => {
    const soci = { numeroSoci: '1', ultimPagament: '2025-01-01' };
    expect(calcularEstatSoci(soci, new Date('2026-06-01'))).toBe(ESTAT_VENCUT);
  });

  it('retorna Al dia el mateix dia del venciment', () => {
    const soci = { numeroSoci: '1', ultimPagament: '2025-06-01' };
    expect(calcularEstatSoci(soci, new Date('2026-06-01'))).toBe(ESTAT_AL_DIA);
  });

  it('retorna Pendent quan estatManual és pendent, encara que estigui al dia per data', () => {
    const soci = { numeroSoci: '1', ultimPagament: '2026-01-01', estatManual: 'pendent' };
    expect(calcularEstatSoci(soci, new Date('2026-06-01'))).toBe(ESTAT_PENDENT);
  });

  it('retorna Al dia el mateix dia del venciment amb una hora local real (evita el bug de fus horari)', () => {
    const soci = { numeroSoci: '1', ultimPagament: '2025-06-01' };
    // new Date(any, mes, dia, ...) construeix en hora LOCAL, com fa l'app en producció
    // (a diferència de new Date('YYYY-MM-DD'), que és mitjanit UTC).
    expect(calcularEstatSoci(soci, new Date(2026, 5, 1, 15, 0))).toBe(ESTAT_AL_DIA);
  });

  it('retorna Nou registre quan encara no té número de soci assignat, encara que les dates diguin que està al dia', () => {
    const soci = { ultimPagament: '2026-01-01', numeroSoci: '' };
    expect(calcularEstatSoci(soci, new Date('2026-06-01'))).toBe(ESTAT_NOU_REGISTRE);
  });

  it('Nou registre té prioritat fins i tot sobre estatManual pendent', () => {
    const soci = { ultimPagament: '2026-01-01', numeroSoci: '', estatManual: 'pendent' };
    expect(calcularEstatSoci(soci, new Date('2026-06-01'))).toBe(ESTAT_NOU_REGISTRE);
  });
});

describe('calcularVenciment', () => {
  it('retorna la data de l\'últim pagament més un any', () => {
    const venciment = calcularVenciment({ ultimPagament: '2026-03-15' });
    expect(venciment.getFullYear()).toBe(2027);
    expect(venciment.getMonth()).toBe(2);
    expect(venciment.getDate()).toBe(15);
  });

  it('usa inicPeriode (primer ús del carnet des del pagament) en comptes de ultimPagament quan hi és', () => {
    const venciment = calcularVenciment({ ultimPagament: '2026-03-15', inicPeriode: '2026-04-02' });
    expect(venciment.getFullYear()).toBe(2027);
    expect(venciment.getMonth()).toBe(3);
    expect(venciment.getDate()).toBe(2);
  });

  it('cau a ultimPagament si encara no s\'ha fixat inicPeriode', () => {
    const venciment = calcularVenciment({ ultimPagament: '2026-03-15', inicPeriode: null });
    expect(venciment.getFullYear()).toBe(2027);
    expect(venciment.getMonth()).toBe(2);
    expect(venciment.getDate()).toBe(15);
  });
});

describe('diesFinsVenciment', () => {
  it('retorna un número positiu quan encara falten dies per vèncer', () => {
    const soci = { ultimPagament: '2026-03-01' };
    expect(diesFinsVenciment(soci, new Date(2027, 1, 15))).toBe(14);
  });

  it('retorna 0 el mateix dia del venciment', () => {
    const soci = { ultimPagament: '2026-03-01' };
    expect(diesFinsVenciment(soci, new Date(2027, 2, 1))).toBe(0);
  });

  it('retorna un número negatiu quan ja ha vençut', () => {
    const soci = { ultimPagament: '2026-03-01' };
    expect(diesFinsVenciment(soci, new Date(2027, 2, 11))).toBe(-10);
  });
});

// --- Renovacions anticipades -------------------------------------------------------------------------------------
// Regla de la propietat: si es renova (paga) ABANS que venci el període actual, els 12 mesos nous comencen quan
// acaba l'actual (venciment nou = venciment antic + 12 mesos, sense perdre cap dia); si ja havia vençut, comencen el
// dia del pagament. Damunt d'això continua la regla d'activació: l'any compta des del primer escaneig fet DINS del
// període pagat (inicPeriode), mai abans.

// Còpia literal de calcularVenciment tal com era abans d'aquest canvi: és la referència de compatibilitat.
function vencimentAntic(soci) {
  const dataBase = soci.inicPeriode || soci.ultimPagament;
  const [any, mes, dia] = dataBase.split('-').map(Number);
  return new Date(any + 1, mes - 1, dia);
}
const iso = (data) => data.toLocaleDateString('sv-SE');

describe('compatibilitat: les dades desades d\'abans donen el mateix venciment i estat', () => {
  it('els 60 socis de l\'arnès (ultimPagament, inicPeriode buit o igual, estatManual) no canvien', () => {
    const dades = dadesInicials();
    const socis = Object.entries(dades).filter(([camí]) => camí.startsWith('socis/')).map(([, s]) => s);
    expect(socis).toHaveLength(60);
    for (const soci of socis) {
      expect(iso(calcularVenciment(soci))).toBe(iso(vencimentAntic(soci)));
      for (const avui of [new Date(), new Date(2026, 0, 1), new Date(2027, 11, 31, 23, 30)]) {
        const ambAntic = soci.estatManual === 'pendent' ? ESTAT_PENDENT
          : (new Date(avui.getFullYear(), avui.getMonth(), avui.getDate()) > vencimentAntic(soci) ? ESTAT_VENCUT : ESTAT_AL_DIA);
        expect(calcularEstatSoci(soci, avui)).toBe(ambAntic);
      }
    }
  });

  it.each([
    ['només ultimPagament', { ultimPagament: '2025-10-25' }],
    ['inicPeriode posterior al pagament (activació normal)', { ultimPagament: '2025-10-01', inicPeriode: '2025-10-20' }],
    ['inicPeriode igual al pagament', { ultimPagament: '2025-10-01', inicPeriode: '2025-10-01' }],
    ['inicPeriode buit (cadena buida)', { ultimPagament: '2025-10-01', inicPeriode: '' }],
    ['inicPeriode null', { ultimPagament: '2025-10-01', inicPeriode: null }],
    ['pagament el 29 de febrer (venç l\'1 de març)', { ultimPagament: '2024-02-29' }],
    ['pagament el 31 de desembre', { ultimPagament: '2025-12-31' }],
    ['pagament l\'1 de gener', { ultimPagament: '2026-01-01' }],
    ['activació moltes setmanes després del pagament', { ultimPagament: '2025-06-01', inicPeriode: '2025-09-15' }],
  ])('%s', (_nom, soci) => {
    expect(iso(calcularVenciment(soci))).toBe(iso(vencimentAntic(soci)));
  });

  it('el 29 de febrer venç l\'1 de març de l\'any següent (comportament documentat)', () => {
    expect(iso(calcularVenciment({ ultimPagament: '2024-02-29' }))).toBe('2025-03-01');
  });

  it('estatManual pendent continua manant per sobre de la data, també amb una quota encadenada', () => {
    const soci = { numeroSoci: 1, ultimPagament: '2026-09-01', vigenciaDes: '2026-11-15', estatManual: 'pendent' };
    expect(calcularEstatSoci(soci, new Date(2026, 9, 25))).toBe(ESTAT_PENDENT);
  });
});

describe('iniciVigencia i iniciPeriodeActual', () => {
  it('sense vigenciaDes (dades d\'abans), la quota compta des d\'ultimPagament', () => {
    expect(iniciVigencia({ ultimPagament: '2026-03-01' })).toBe('2026-03-01');
  });

  it('vigenciaDes (renovació encadenada) mana sobre ultimPagament, que és la data real del pagament', () => {
    expect(iniciVigencia({ ultimPagament: '2026-03-01', vigenciaDes: '2026-04-10' })).toBe('2026-04-10');
  });

  it('sense cap data, retorna null', () => {
    expect(iniciVigencia({})).toBeNull();
  });

  it('l\'inici efectiu és l\'activació si és dins del període pagat', () => {
    expect(iniciPeriodeActual({ ultimPagament: '2026-03-01', inicPeriode: '2026-03-20' })).toBe('2026-03-20');
  });

  it('una activació anterior a l\'inici de la quota (escaneig fet abans que comencés) no avança l\'inici', () => {
    expect(iniciPeriodeActual({ ultimPagament: '2026-03-01', vigenciaDes: '2026-04-10', inicPeriode: '2026-03-05' }))
      .toBe('2026-04-10');
  });
});

describe('calcularVenciment amb renovacions anticipades', () => {
  it('una renovació encadenada venç un any després de vigenciaDes, no del dia que es va pagar', () => {
    expect(iso(calcularVenciment({ ultimPagament: '2026-02-01', vigenciaDes: '2026-03-10' }))).toBe('2027-03-10');
  });

  it('dades antigues amb el bug: un escaneig abans de la data pagada (inicPeriode < ultimPagament) ja no fa perdre dies', () => {
    // Abans: venciment = inicPeriode + 1 any = 2026-11-02 (es perdien els dies fins al 2026-12-01).
    expect(iso(calcularVenciment({ ultimPagament: '2026-12-01', inicPeriode: '2025-11-02' }))).toBe('2027-12-01');
  });
});

describe('novaQuota (inici de la quota que es paga ara)', () => {
  const vigent = { numeroSoci: 1, ultimPagament: '2025-11-15' }; // venç el 2026-11-15

  it.each([
    ['11 mesos abans del venciment', '2025-12-15', '2026-11-15'],
    ['un dia abans del venciment', '2026-11-14', '2026-11-15'],
    ['el mateix dia del venciment', '2026-11-15', '2026-11-15'],
    ['un dia després del venciment (ja ha vençut)', '2026-11-16', '2026-11-16'],
    ['mesos després del venciment', '2027-03-02', '2027-03-02'],
  ])('renovació %s', (_nom, dataPagament, vigenciaDes) => {
    expect(novaQuota(vigent, dataPagament, { renovacio: true })).toEqual({
      vigenciaDes, vencimentAnterior: '2026-11-15',
    });
  });

  it('el venciment anterior inclou l\'activació del període actual (no es perden els dies fins al primer escaneig)', () => {
    const soci = { numeroSoci: 1, ultimPagament: '2025-11-15', inicPeriode: '2025-12-03' };
    expect(novaQuota(soci, '2026-10-25', { renovacio: true })).toEqual({
      vigenciaDes: '2026-12-03', vencimentAnterior: '2026-12-03',
    });
  });

  it('una alta comença el dia del pagament, encara que la fitxa ja tingui una data provisional (sol·licitud aprovada)', () => {
    expect(novaQuota({ numeroSoci: 1, ultimPagament: '2026-10-20' }, '2026-10-25', { renovacio: false }))
      .toEqual({ vigenciaDes: '2026-10-25', vencimentAnterior: null });
  });

  it('una renovació d\'un soci sense cap data comença el dia del pagament', () => {
    expect(novaQuota({ numeroSoci: 1 }, '2026-10-25', { renovacio: true }))
      .toEqual({ vigenciaDes: '2026-10-25', vencimentAnterior: null });
  });

  it('31 de desembre / 1 de gener: pagar el 31/12 una quota que venç l\'1/1 encadena a l\'1/1', () => {
    expect(novaQuota({ numeroSoci: 1, ultimPagament: '2026-01-01' }, '2026-12-31', { renovacio: true }))
      .toEqual({ vigenciaDes: '2027-01-01', vencimentAnterior: '2027-01-01' });
  });

  it('any de traspàs: una quota del 29/02 venç l\'1/03 i la renovació anticipada comença l\'1/03', () => {
    expect(novaQuota({ numeroSoci: 1, ultimPagament: '2024-02-29' }, '2025-02-01', { renovacio: true }))
      .toEqual({ vigenciaDes: '2025-03-01', vencimentAnterior: '2025-03-01' });
  });

  it('dues renovacions anticipades seguides s\'encadenen: cada una suma un any', () => {
    const soci = { numeroSoci: 1, ultimPagament: '2025-11-15' };
    const primera = novaQuota(soci, '2026-01-10', { renovacio: true });
    const desprésPrimera = { ...soci, ultimPagament: '2026-01-10', vigenciaDes: primera.vigenciaDes, inicPeriode: null };
    const segona = novaQuota(desprésPrimera, '2026-02-10', { renovacio: true });
    expect([primera.vigenciaDes, segona.vigenciaDes]).toEqual(['2026-11-15', '2027-11-15']);
    expect(iso(calcularVenciment({ ...desprésPrimera, ultimPagament: '2026-02-10', vigenciaDes: segona.vigenciaDes })))
      .toBe('2028-11-15');
  });
});

describe('calcularPeriodes (historial de quotes d\'un soci)', () => {
  it('encadena: cada quota comença a max(data del pagament, final de l\'anterior)', () => {
    const periodes = calcularPeriodes([
      { data: '2026-01-10', total: 30 }, // anticipada: la primera venç el 2026-11-15
      { data: '2025-11-15', total: 30 },
      { data: '2028-02-01', total: 35 }, // ja havia vençut (2027-11-15)
    ]);
    expect(periodes.map(({ data, vigenciaDes, inici, fi, total }) => ({ data, vigenciaDes, inici, fi, total }))).toEqual([
      { data: '2025-11-15', vigenciaDes: '2025-11-15', inici: '2025-11-15', fi: '2026-11-15', total: 30 },
      { data: '2026-01-10', vigenciaDes: '2026-11-15', inici: '2026-11-15', fi: '2027-11-15', total: 30 },
      { data: '2028-02-01', vigenciaDes: '2028-02-01', inici: '2028-02-01', fi: '2029-02-01', total: 35 },
    ]);
  });

  it('l\'activació (inicPeriode) només s\'aplica a l\'última quota i només si és dins del seu període', () => {
    const pagaments = [{ data: '2025-01-01' }, { data: '2026-01-01' }];
    expect(calcularPeriodes(pagaments, { inicPeriode: '2026-01-20' }).map((p) => [p.vigenciaDes, p.inici, p.fi]))
      .toEqual([['2025-01-01', '2025-01-01', '2026-01-01'], ['2026-01-01', '2026-01-20', '2027-01-20']]);
    expect(calcularPeriodes(pagaments, { inicPeriode: '2025-12-01' }).at(-1).fi).toBe('2027-01-01');
  });

  it('respecta vencimentAnterior desat al moviment (inclou l\'activació que tenia la quota anterior en pagar)', () => {
    const periodes = calcularPeriodes([
      { data: '2025-11-15' },
      { data: '2026-10-25', vencimentAnterior: '2026-12-03' },
    ]);
    expect(periodes.at(-1)).toEqual(expect.objectContaining({ vigenciaDes: '2026-12-03', fi: '2027-12-03' }));
  });

  it('les quotes antigues (renovació desada amb el venciment com a data) no canvien', () => {
    const periodes = calcularPeriodes([{ data: '2024-10-01' }, { data: '2025-10-20' }]);
    expect(periodes.map((p) => p.inici)).toEqual(['2024-10-01', '2025-10-20']);
  });

  it('ignora els moviments sense data i no muta l\'entrada', () => {
    const pagaments = [{ data: '2026-01-10' }, { data: '' }, { data: '2025-11-15' }];
    const copia = structuredClone(pagaments);
    expect(calcularPeriodes(pagaments)).toHaveLength(2);
    expect(pagaments).toEqual(copia);
  });

  it('sense pagaments, retorna una llista buida', () => {
    expect(calcularPeriodes([])).toEqual([]);
  });
});

describe('inicPeriodeEnEscanejar (què desa l\'escaneig)', () => {
  it('abans de la data pagada (renovació anticipada) no fixa res: el període actual encara corre', () => {
    const soci = { ultimPagament: '2026-10-01', vigenciaDes: '2026-11-15', inicPeriode: null };
    expect(inicPeriodeEnEscanejar(soci, '2026-10-25')).toBeNull();
  });

  it('cada escaneig abans de la data pagada deixa inicPeriode com estava (no el va movent)', () => {
    const soci = { ultimPagament: '2026-12-01', inicPeriode: '2026-11-02' }; // dada antiga del bug
    expect(inicPeriodeEnEscanejar(soci, '2026-11-20')).toBe('2026-11-02');
  });

  it('el primer escaneig des de l\'inici de la quota la fixa a avui', () => {
    expect(inicPeriodeEnEscanejar({ ultimPagament: '2026-10-01', vigenciaDes: '2026-11-15' }, '2026-11-15'))
      .toBe('2026-11-15');
    expect(inicPeriodeEnEscanejar({ ultimPagament: '2026-10-01' }, '2026-10-25')).toBe('2026-10-25');
  });

  it('una activació d\'abans de l\'inici de la quota es reemplaça al primer escaneig dins del període', () => {
    expect(inicPeriodeEnEscanejar({ ultimPagament: '2026-12-01', inicPeriode: '2026-11-02' }, '2026-12-05'))
      .toBe('2026-12-05');
  });

  it('si ja s\'ha activat dins del període, no la toca', () => {
    expect(inicPeriodeEnEscanejar({ ultimPagament: '2026-01-01', inicPeriode: '2026-01-15' }, '2026-10-25'))
      .toBe('2026-01-15');
  });

  it('sense cap data de pagament, no fixa res', () => {
    expect(inicPeriodeEnEscanejar({ inicPeriode: '' }, '2026-10-25')).toBe('');
  });
});

describe('sincronitzacioQuotes (fitxa del soci a partir de l\'historial, en editar o eliminar un moviment)', () => {
  const historial = [
    { data: '2025-11-15' },
    { data: '2026-10-25', vencimentAnterior: '2026-12-03' },
  ];

  it('si l\'historial dona el mateix que la fitxa (p. ex. només s\'ha canviat el concepte), no escriu res', () => {
    const soci = { ultimPagament: '2026-10-25', vigenciaDes: '2026-12-03', inicPeriode: '2026-12-10' };
    expect(sincronitzacioQuotes(soci, historial)).toEqual({});
  });

  it('una fitxa antiga sense vigenciaDes coherent amb l\'historial tampoc s\'escriu', () => {
    const soci = { ultimPagament: '2025-10-20', inicPeriode: '2025-10-30' };
    expect(sincronitzacioQuotes(soci, [{ data: '2024-10-01' }, { data: '2025-10-20' }])).toEqual({});
  });

  it('en corregir la data de l\'última quota, recalcula ultimPagament i vigenciaDes i conserva l\'activació si encara és dins del període', () => {
    const soci = { ultimPagament: '2026-09-01', vigenciaDes: '2026-09-01', inicPeriode: '2026-09-05' };
    expect(sincronitzacioQuotes(soci, [{ data: '2025-01-01' }, { data: '2026-08-28' }]))
      .toEqual({ ultimPagament: '2026-08-28', vigenciaDes: '2026-08-28' });
  });

  it('en eliminar l\'última quota, torna a la quota anterior i descarta l\'activació de la quota eliminada', () => {
    const soci = { ultimPagament: '2026-10-25', vigenciaDes: '2026-12-03', inicPeriode: '2026-12-10' };
    expect(sincronitzacioQuotes(soci, [{ data: '2025-11-15' }]))
      .toEqual({ ultimPagament: '2025-11-15', vigenciaDes: '2025-11-15', inicPeriode: null });
  });

  it('una fitxa antiga amb la data real d\'una renovació anticipada recupera els dies en tornar a sincronitzar', () => {
    const soci = { ultimPagament: '2026-09-01', inicPeriode: '2026-09-02' };
    expect(sincronitzacioQuotes(soci, [{ data: '2025-11-15' }, { data: '2026-09-01' }]))
      .toEqual({ vigenciaDes: '2026-11-15', inicPeriode: null });
  });

  it('si ultimPagament canvia i la fitxa no té vigenciaDes, l\'escriu igualment (no es pot deduir d\'ultimPagament)', () => {
    const soci = { ultimPagament: '2026-11-15' };
    expect(sincronitzacioQuotes(soci, [{ data: '2025-11-15' }, { data: '2026-10-01', vencimentAnterior: '2026-11-15' }]))
      .toEqual({ ultimPagament: '2026-10-01', vigenciaDes: '2026-11-15' });
  });

  it('sense cap quota, no escriu res', () => {
    expect(sincronitzacioQuotes({ ultimPagament: '2026-01-01' }, [])).toEqual({});
  });
});

// Fix round 1: dues quotes amb la mateixa `data` s'encadenaven en l'ordre d'arribada (la consulta no té orderBy):
// en una altra edició, la renovació podia quedar abans que la quota a què s'encadena i sumar un any de més.
describe('ordre de l\'historial: el resultat no depèn de l\'ordre dels moviments', () => {
  const permutacions = (llista) => (llista.length <= 1 ? [llista] : llista.flatMap((x, i) => (
    permutacions([...llista.slice(0, i), ...llista.slice(i + 1)]).map((resta) => [x, ...resta])
  )));
  const nomesPeriode = (periodes) => periodes.map(({ vigenciaDes, inici, fi }) => ({ vigenciaDes, inici, fi }));

  it('dues renovacions anticipades el mateix dia: sempre el mateix encadenament i un sol any per quota', () => {
    const historial = [
      { id: 'm1', data: '2025-11-15', total: 30 },
      { id: 'm2', data: '2026-10-25', vencimentAnterior: '2026-11-15', total: 30 },
      { id: 'm3', data: '2026-10-25', vencimentAnterior: '2027-11-15', total: 30 },
    ];
    const esperat = [
      { vigenciaDes: '2025-11-15', inici: '2025-11-15', fi: '2026-11-15' },
      { vigenciaDes: '2026-11-15', inici: '2026-11-15', fi: '2027-11-15' },
      { vigenciaDes: '2027-11-15', inici: '2027-11-15', fi: '2028-11-15' },
    ];
    const soci = { ultimPagament: '2026-10-25', vigenciaDes: '2027-11-15' };
    for (const ordre of permutacions(historial)) {
      expect(nomesPeriode(calcularPeriodes(ordre))).toEqual(esperat);
      expect(sincronitzacioQuotes(soci, ordre)).toEqual({});
    }
  });

  it('alta i renovació simultànies el mateix dia: l\'alta (sense vencimentAnterior) va primer', () => {
    const historial = [
      { id: 'b', data: '2026-10-25', tipusQuota: 'renovacio', vencimentAnterior: '2027-10-25' },
      { id: 'a', data: '2026-10-25', tipusQuota: 'alta' },
    ];
    const soci = { ultimPagament: '2026-10-25', vigenciaDes: '2027-10-25' };
    for (const ordre of permutacions(historial)) {
      expect(calcularPeriodes(ordre).map((p) => [p.id, p.vigenciaDes, p.fi])).toEqual([
        ['a', '2026-10-25', '2027-10-25'], ['b', '2027-10-25', '2028-10-25'],
      ]);
      expect(sincronitzacioQuotes(soci, ordre)).toEqual({});
    }
  });

  it('empat total de data i vencimentAnterior: desempata per id i, sense id, pel contingut', () => {
    const ambId = [{ id: 'z', data: '2026-01-01', total: 30 }, { id: 'a', data: '2026-01-01', total: 35 }];
    const senseId = [{ data: '2026-01-01', total: 30 }, { data: '2026-01-01', total: 35 }];
    for (const historial of [ambId, senseId]) {
      const resultats = permutacions(historial).map((ordre) => calcularPeriodes(ordre));
      resultats.forEach((r) => expect(r).toEqual(resultats[0]));
    }
    expect(calcularPeriodes(ambId).map((p) => p.id)).toEqual(['a', 'z']);
  });
});
