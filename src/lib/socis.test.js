import { describe, it, expect } from 'vitest';
import { filtrarSocis, ordenarSocis, teNumeroSoci, cercaCoincideix, resumDashboardSocis, etiquetaSoci } from './socis';

const socis = [
  { numeroSoci: 1, nom: 'Anna', cognoms: 'Vidal', ultimPagament: '2026-01-01' },
  { numeroSoci: 2, nom: 'Marc', cognoms: 'Serra', ultimPagament: '2024-01-01' },
];

describe('filtrarSocis', () => {
  it('retorna tots els socis sense filtres', () => {
    expect(filtrarSocis(socis, {}, new Date('2026-06-01'))).toHaveLength(2);
  });

  it('filtra per text de cerca en nom o cognoms', () => {
    const resultat = filtrarSocis(socis, { cerca: 'serra' }, new Date('2026-06-01'));
    expect(resultat).toEqual([socis[1]]);
  });

  it('filtra per estat calculat', () => {
    const resultat = filtrarSocis(socis, { estat: 'vencut' }, new Date('2026-06-01'));
    expect(resultat).toEqual([socis[1]]);
  });

  it('filtra per pròxima renovació (al dia i a menys de 30 dies del venciment)', () => {
    const propAVencer = { numeroSoci: 3, nom: 'Pau', cognoms: 'Roca', ultimPagament: '2025-06-15' };
    const llunyDeVencer = { numeroSoci: 4, nom: 'Eva', cognoms: 'Puig', ultimPagament: '2026-01-01' };
    const resultat = filtrarSocis(
      [...socis, propAVencer, llunyDeVencer],
      { estat: 'proxima-renovacio' },
      new Date('2026-06-01')
    );
    expect(resultat).toEqual([propAVencer]);
  });
});

describe('teNumeroSoci', () => {
  it('és fals quan el soci encara no té número assignat', () => {
    expect(teNumeroSoci({ numeroSoci: '' })).toBe(false);
    expect(teNumeroSoci({})).toBe(false);
  });

  it('és cert quan el soci ja té número assignat', () => {
    expect(teNumeroSoci({ numeroSoci: 12 })).toBe(true);
    expect(teNumeroSoci({ numeroSoci: '12' })).toBe(true);
  });
});

describe('cercaCoincideix', () => {
  const soci = { numeroSoci: 7, nom: 'Anna', cognoms: 'Vidal' };

  it('coincideix per nom, cognoms o número', () => {
    expect(cercaCoincideix(soci, 'anna')).toBe(true);
    expect(cercaCoincideix(soci, 'Vidal')).toBe(true);
    expect(cercaCoincideix(soci, '7')).toBe(true);
  });

  it('no coincideix quan el text no hi és', () => {
    expect(cercaCoincideix(soci, 'Serra')).toBe(false);
  });

  it('coincideix amb tothom quan la cerca és buida', () => {
    expect(cercaCoincideix(soci, '')).toBe(true);
  });
});

describe('ordenarSocis', () => {
  const tresSocis = [
    { numeroSoci: 2, nom: 'Marc', cognoms: 'Serra', ultimPagament: '2024-01-01' },
    { numeroSoci: 10, nom: 'Anna', cognoms: 'Vidal', ultimPagament: '2026-01-01' },
    { numeroSoci: 1, nom: 'Berta', cognoms: 'Puig', ultimPagament: '2025-06-01' },
  ];

  it('per defecte ordena per número de soci descendent (més nou primer)', () => {
    expect(ordenarSocis(tresSocis).map((s) => s.numeroSoci)).toEqual([10, 2, 1]);
  });

  it('ordena per número de soci ascendent', () => {
    const resultat = ordenarSocis(tresSocis, { columna: 'numeroSoci', direccio: 'asc' });
    expect(resultat.map((s) => s.numeroSoci)).toEqual([1, 2, 10]);
  });

  it('ordena per nom alfabèticament', () => {
    const resultat = ordenarSocis(tresSocis, { columna: 'nom', direccio: 'asc' });
    expect(resultat.map((s) => s.nom)).toEqual(['Anna', 'Berta', 'Marc']);
  });

  it('no muta l\'array original', () => {
    const original = [...tresSocis];
    ordenarSocis(tresSocis, { columna: 'nom', direccio: 'asc' });
    expect(tresSocis).toEqual(original);
  });

  it('ordena per assistències recents descendent', () => {
    const ambAssistencies = [
      { numeroSoci: 1, nom: 'Anna', cognoms: 'Vidal', assistencies: 2 },
      { numeroSoci: 2, nom: 'Marc', cognoms: 'Serra', assistencies: 5 },
      { numeroSoci: 3, nom: 'Berta', cognoms: 'Puig' },
    ];
    const resultat = ordenarSocis(ambAssistencies, { columna: 'assistencies', direccio: 'desc' });
    expect(resultat.map((s) => s.numeroSoci)).toEqual([2, 1, 3]);
  });
});

describe('resumDashboardSocis', () => {
  // Constructor de 3 arguments (any, mes, dia) perquè és sempre hora local, a diferència
  // de new Date('2026-08-31'), que es parseja com a UTC i pot desplaçar el dia en fusos
  // horaris per darrere d'UTC.
  const avui = new Date(2026, 7, 31);

  it('compta el total de socis', () => {
    const socis = [
      { numeroSoci: 1, nom: 'Anna', cognoms: 'Vidal', dataAlta: '2026-01-01', ultimPagament: '2026-01-01' },
      { numeroSoci: 2, nom: 'Marc', cognoms: 'Serra', dataAlta: '2026-02-01', ultimPagament: '2026-02-01' },
    ];
    expect(resumDashboardSocis(socis, [], [], avui).total).toBe(2);
  });

  it('exclou els socis desactivats del total', () => {
    const socis = [
      { numeroSoci: 1, nom: 'Anna', cognoms: 'Vidal', dataAlta: '2026-01-01', ultimPagament: '2026-01-01' },
      { numeroSoci: 2, nom: 'Marc', cognoms: 'Serra', dataAlta: '2026-02-01', ultimPagament: '2026-02-01', actiu: false },
    ];
    expect(resumDashboardSocis(socis, [], [], avui).total).toBe(1);
  });

  it('assistenciaMitjana és 0 si no hi ha sessions passades', () => {
    const socis = [{ numeroSoci: 1, nom: 'Anna', cognoms: 'Vidal', ultimPagament: '2026-08-01' }];
    expect(resumDashboardSocis(socis, [], [], avui).assistenciaMitjana).toBe(0);
  });

  it('assistenciaMitjana és 100 si tots els socis han anat a totes les sessions passades', () => {
    const socis = [{ numeroSoci: 1, nom: 'Anna', cognoms: 'Vidal', ultimPagament: '2026-08-01' }];
    const sessions = [
      { id: 's1', data: '2026-08-01' },
      { id: 's2', data: '2026-08-15' },
    ];
    const entrades = [
      { tipus: 'soci', numeroSoci: 1, sessionId: 's1' },
      { tipus: 'soci', numeroSoci: 1, sessionId: 's2' },
    ];
    expect(resumDashboardSocis(socis, sessions, entrades, avui).assistenciaMitjana).toBe(100);
  });

  it('assistenciaMitjana fa la mitjana entre socis i ignora sessions futures', () => {
    const socis = [
      { numeroSoci: 1, nom: 'Anna', cognoms: 'Vidal', ultimPagament: '2026-08-01' },
      { numeroSoci: 2, nom: 'Marc', cognoms: 'Serra', ultimPagament: '2026-08-01' },
    ];
    const sessions = [
      { id: 's1', data: '2026-08-01' },
      { id: 's2', data: '2026-08-15' },
      { id: 's3', data: '2099-01-01' },
    ];
    const entrades = [
      { tipus: 'soci', numeroSoci: 1, sessionId: 's1' },
      { tipus: 'soci', numeroSoci: 1, sessionId: 's2' },
    ];
    // Anna: 2/2 = 100%, Marc: 0/2 = 0% → mitjana 50%. La sessió futura (s3) no compta.
    expect(resumDashboardSocis(socis, sessions, entrades, avui).assistenciaMitjana).toBe(50);
  });

  it('renovacionsProperes inclou només socis al dia que venceran en els propers 30 dies, ordenats per dies', () => {
    const socis = [
      { numeroSoci: 1, nom: 'Anna', cognoms: 'Vidal', ultimPagament: '2025-09-10' },   // venç 2026-09-10, dins 30 dies
      { numeroSoci: 2, nom: 'Marc', cognoms: 'Serra', ultimPagament: '2025-09-01' },   // venç 2026-09-01, dins 30 dies, abans que l'Anna
      { numeroSoci: 3, nom: 'Laia', cognoms: 'Puig', ultimPagament: '2026-01-01' },    // venç 2027-01-01, fora de finestra
      { numeroSoci: 4, nom: 'Pau', cognoms: 'Font', ultimPagament: '2024-01-01' },     // ja vençut, exclòs
    ];
    const resultat = resumDashboardSocis(socis, [], [], avui).renovacionsProperes;
    expect(resultat.map((s) => s.numeroSoci)).toEqual([2, 1]);
  });
});

describe('etiquetaSoci', () => {
  it('combina el nom, els cognoms i el número de soci', () => {
    expect(etiquetaSoci({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: 7 })).toBe('Anna Vidal — núm. 7');
  });
});
