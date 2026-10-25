import { describe, it, expect, vi } from 'vitest';
import usuaris from './usuaris.js';

const {
  RETENCIO_CORREUS_ENLLAC, executar, llistar, crear, editar, canviarEstat, restablirContrasenya, eliminar, LIMIT_USUARIS, LIMIT_CREACIONS_HORA,
} = usuaris;

const ARA = Date.parse('2026-10-25T10:00:00Z');
const ENLLAC = 'https://cineclub.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=SECRET&x=<y>';
const ADMIN = { uid: 'admin1', token: { role: 'admin', email: 'admin@cineclub.cat' } };

const errorAuth = (code) => Object.assign(new Error(code), { code });

function usuari(uid, canvis = {}) {
  return {
    uid,
    email: `${uid}@example.com`,
    displayName: `Nom ${uid}`,
    disabled: false,
    customClaims: { role: 'taquilla' },
    passwordHash: 'HASH',
    passwordSalt: 'SALT',
    tokensValidAfterTime: 'x',
    providerData: [{ providerId: 'password' }],
    metadata: {
      creationTime: 'Sat, 01 Aug 2026 10:00:00 GMT',
      lastSignInTime: 'Mon, 05 Oct 2026 18:00:00 GMT',
      lastRefreshTime: '2026-10-20T19:30:00.000Z',
    },
    ...canvis,
  };
}

// Admin SDK d'Auth simulat: desa les crides per comprovar què s'ha fet.
function authFals(inicials = []) {
  const usuarisMap = new Map(inicials.map((u) => [u.uid, u]));
  const crides = [];
  let comptador = 0;
  const trobat = (uid) => {
    if (!usuarisMap.has(uid)) throw errorAuth('auth/user-not-found');
    return usuarisMap.get(uid);
  };
  return {
    usuaris: usuarisMap,
    crides,
    getUser: vi.fn(async (uid) => trobat(uid)),
    getUserByEmail: vi.fn(async (email) => {
      const u = [...usuarisMap.values()].find((x) => x.email === email);
      if (!u) throw errorAuth('auth/user-not-found');
      return u;
    }),
    createUser: vi.fn(async (props) => {
      comptador += 1;
      const uid = `nou${comptador}`;
      usuarisMap.set(uid, { uid, email: props.email, displayName: props.displayName, disabled: false, metadata: {} });
      crides.push(['createUser', props]);
      return usuarisMap.get(uid);
    }),
    setCustomUserClaims: vi.fn(async (uid, claims) => {
      trobat(uid).customClaims = claims;
      crides.push(['setCustomUserClaims', uid, claims]);
    }),
    updateUser: vi.fn(async (uid, props) => {
      const u = trobat(uid);
      if (props.disabled !== undefined) u.disabled = props.disabled;
      if (props.email !== undefined) u.email = props.email;
      if (props.displayName !== undefined) u.displayName = props.displayName;
      crides.push(['updateUser', uid, props]);
    }),
    revokeRefreshTokens: vi.fn(async (uid) => { crides.push(['revokeRefreshTokens', uid]); }),
    deleteUser: vi.fn(async (uid) => { trobat(uid); usuarisMap.delete(uid); crides.push(['deleteUser', uid]); }),
    listUsers: vi.fn(async (max, pagina) => {
      const tots = [...usuarisMap.values()];
      const inici = pagina ? Number(pagina) : 0;
      // Pàgines de 2 per provar la paginació.
      const users = tots.slice(inici, inici + 2);
      return { users, pageToken: inici + 2 < tots.length ? String(inici + 2) : undefined };
    }),
    generatePasswordResetLink: vi.fn(async () => ENLLAC),
  };
}

function dbFals({ auditoriaRecent = [] } = {}) {
  const auditoria = [];
  const mail = new Map();
  return {
    auditoria,
    mail,
    consultes: [],
    collection(nom) {
      if (nom === 'mail') {
        return {
          doc: (id) => ({
            create: async (dades) => {
              if (mail.has(id)) throw Object.assign(new Error('6 ALREADY_EXISTS'), { code: 6 });
              mail.set(id, dades);
            },
          }),
        };
      }
      return {
        add: async (dades) => { auditoria.push(dades); },
        where: (camp, op, valor) => {
          this.consultes.push([camp, op, valor]);
          return { get: async () => ({ docs: auditoriaRecent.map((d) => ({ data: () => d })) }) };
        },
      };
    },
  };
}

// L'admin que fa les crides (admin1) sempre existeix al compte actual amb el rol d'admin, tret que es passi.
const ADMIN_ACTUAL = usuari('admin1', { email: 'admin@cineclub.cat', customClaims: { role: 'admin' } });

function entorn({ usuaris: inicials = [usuari('t1'), usuari('t2'), usuari('adm', { customClaims: { role: 'admin' } }), usuari('cap', { customClaims: undefined })], ...opcions } = {}) {
  const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn() };
  const ambAdmin = inicials.some((u) => u.uid === 'admin1') ? inicials : [...inicials, ADMIN_ACTUAL];
  const deps = {
    auth: authFals(ambAdmin),
    db: dbFals(opcions),
    FieldValue: { serverTimestamp: () => 'SERVER_TS' },
    logger,
    ara: ARA,
  };
  return deps;
}

const totElRegistre = (deps) => JSON.stringify(Object.values(deps.logger).flatMap((f) => f.mock.calls));

const CRIDES = [
  ['llistar', (deps, auth) => llistar(deps, auth)],
  ['crear', (deps, auth) => crear(deps, auth, { nom: 'Pere', correu: 'pere@example.com' })],
  ['editar', (deps, auth) => editar(deps, auth, { uid: 't1', nom: 'Nou', correu: 't1@example.com' })],
  ['canviarEstat', (deps, auth) => canviarEstat(deps, auth, { uid: 't1', desactivat: true })],
  ['restablirContrasenya', (deps, auth) => restablirContrasenya(deps, auth, { uid: 't1' })],
  ['eliminar', (deps, auth) => eliminar(deps, auth, { uid: 't1' })],
];

const MUTADORES = CRIDES.filter(([nom]) => nom !== 'llistar' && nom !== 'crear');

describe('usuaris de taquilla — permisos', () => {
  it.each(CRIDES)('%s: rebutja qui no ha iniciat la sessió', async (_nom, crida) => {
    const deps = entorn();
    await expect(crida(deps, undefined)).rejects.toMatchObject({ codi: 'unauthenticated' });
    await expect(crida(deps, { token: { role: 'admin' } })).rejects.toMatchObject({ codi: 'unauthenticated' });
    expect(deps.auth.crides).toEqual([]);
    expect(deps.db.auditoria).toEqual([]);
  });

  it.each(CRIDES)('%s: rebutja un usuari de taquilla o sense rol', async (_nom, crida) => {
    const deps = entorn();
    await expect(crida(deps, { uid: 't2', token: { role: 'taquilla' } })).rejects.toMatchObject({ codi: 'permission-denied' });
    await expect(crida(deps, { uid: 'x', token: {} })).rejects.toMatchObject({ codi: 'permission-denied' });
    await expect(crida(deps, { uid: 'x', token: { role: 'Admin' } })).rejects.toMatchObject({ codi: 'permission-denied' });
    expect(deps.auth.crides).toEqual([]);
    expect(deps.auth.listUsers).not.toHaveBeenCalled();
    expect(deps.db.auditoria).toEqual([]);
  });

  it.each(CRIDES)('%s: rebutja un admin desactivat (el token encara és vàlid)', async (_nom, crida) => {
    const deps = entorn({ usuaris: [usuari('t1'), { ...ADMIN_ACTUAL, disabled: true }] });
    await expect(crida(deps, ADMIN)).rejects.toMatchObject({ codi: 'permission-denied' });
    expect(deps.auth.crides).toEqual([]);
    expect(deps.auth.listUsers).not.toHaveBeenCalled();
    expect(deps.db.auditoria).toEqual([]);
  });

  it.each(CRIDES)('%s: rebutja un admin a qui han tret el rol (token antic)', async (_nom, crida) => {
    for (const customClaims of [{ role: 'taquilla' }, undefined, { role: 'Admin' }]) {
      const deps = entorn({ usuaris: [usuari('t1'), { ...ADMIN_ACTUAL, customClaims }] });
      await expect(crida(deps, ADMIN)).rejects.toMatchObject({ codi: 'permission-denied' });
      expect(deps.auth.crides).toEqual([]);
      expect(deps.db.auditoria).toEqual([]);
    }
  });

  it.each(CRIDES)('%s: si no es pot comprovar el compte de l\'admin, denega', async (_nom, crida) => {
    const deps = entorn();
    deps.auth.getUser.mockRejectedValueOnce(errorAuth('auth/internal-error'));
    await expect(crida(deps, ADMIN)).rejects.toMatchObject({ codi: 'permission-denied' });
    expect(deps.auth.crides).toEqual([]);
    const sensAdmin = entorn();
    sensAdmin.auth.usuaris.delete('admin1');
    await expect(crida(sensAdmin, ADMIN)).rejects.toMatchObject({ codi: 'permission-denied' });
  });

  describe.each(MUTADORES)('%s', (nom) => {
    const amb = {
      editar: (uid) => ({ uid, nom: 'Nou', correu: 'nou@example.com' }),
      canviarEstat: (uid) => ({ uid, desactivat: true }),
      restablirContrasenya: (uid) => ({ uid }),
      eliminar: (uid) => ({ uid }),
    }[nom];
    const funcio = { editar, canviarEstat, restablirContrasenya, eliminar }[nom];

    it.each([['adm', 'un admin'], ['cap', 'un compte sense rol']])('no toca %s (%s)', async (uid) => {
      const deps = entorn();
      await expect(funcio(deps, ADMIN, amb(uid))).rejects.toMatchObject({ codi: 'permission-denied' });
      expect(deps.auth.crides).toEqual([]);
      expect(deps.auth.generatePasswordResetLink).not.toHaveBeenCalled();
      expect(deps.db.auditoria).toEqual([]);
    });

    it('no deixa actuar sobre el propi usuari', async () => {
      const deps = entorn();
      await expect(funcio(deps, ADMIN, amb('admin1')))
        .rejects.toMatchObject({ codi: 'permission-denied', message: 'No pots modificar el teu propi usuari.' });
      expect(deps.auth.crides).toEqual([]);
    });

    it('usuari inexistent → not-found', async () => {
      const deps = entorn();
      await expect(funcio(deps, ADMIN, amb('nohiés'))).rejects.toMatchObject({ codi: 'not-found' });
    });

    it.each([undefined, '', 'a/b', 'a b', 42, 'x'.repeat(129)])('uid no vàlid (%s) → invalid-argument', async (uid) => {
      const deps = entorn();
      await expect(funcio(deps, ADMIN, amb(uid))).rejects.toMatchObject({ codi: 'invalid-argument' });
      expect(deps.auth.getUser.mock.calls).toEqual([['admin1']]);
    });
  });
});

describe('llistar', () => {
  it('torna només els usuaris de taquilla (totes les pàgines) i cap camp sensible', async () => {
    const deps = entorn({
      usuaris: [usuari('t1'), usuari('adm', { customClaims: { role: 'admin' } }), usuari('cap', { customClaims: undefined }),
        usuari('t2', { displayName: 'Anna', disabled: true, metadata: {} }), usuari('t3', { customClaims: { role: 'taquilla', extra: 1 } })],
    });
    const llista = await llistar(deps, ADMIN);
    expect(llista.map((u) => u.uid)).toEqual(['t2', 't1', 't3']);
    expect(llista[0]).toEqual({ uid: 't2', nom: 'Anna', correu: 't2@example.com', desactivat: true, ultimAcces: null, creat: null });
    expect(llista[1]).toEqual({
      uid: 't1', nom: 'Nom t1', correu: 't1@example.com', desactivat: false,
      ultimAcces: '2026-10-20T19:30:00.000Z', creat: '2026-08-01T10:00:00.000Z',
    });
    expect(deps.auth.listUsers).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(llista)).not.toMatch(/HASH|SALT|password|customClaims/);
  });
});

describe('crear', () => {
  it('crea el compte amb exactament el rol de taquilla, envia l\'enllaç i el torna només a l\'admin', async () => {
    const deps = entorn();
    const resultat = await crear(deps, ADMIN, { nom: '  Pere <b>  ', correu: ' Pere@Example.com ', role: 'admin', customClaims: { role: 'admin' } })
      .catch((e) => e);
    // `<` al nom no és vàlid.
    expect(resultat.codi).toBe('invalid-argument');

    const ok = await crear(deps, ADMIN, { nom: '  Pere Vidal  ', correu: ' Pere@Example.com ', role: 'admin', claims: { role: 'admin' } });
    expect(ok).toEqual({ uid: 'nou1', enllac: ENLLAC, correuEnviat: true });
    const [[, props]] = deps.auth.crides.filter(([c]) => c === 'createUser');
    expect(props).toMatchObject({ email: 'pere@example.com', displayName: 'Pere Vidal', emailVerified: false, disabled: false });
    expect(typeof props.password).toBe('string');
    expect(props.password.length).toBeGreaterThanOrEqual(32);
    expect(deps.auth.setCustomUserClaims).toHaveBeenCalledWith('nou1', { role: 'taquilla' });
    expect(deps.auth.generatePasswordResetLink).toHaveBeenCalledWith('pere@example.com', { url: 'https://associacio.cineclubrodadebera.cat/accedir' });
    expect(JSON.stringify(ok)).not.toContain(props.password);

    const [[id, correu]] = [...deps.db.mail];
    expect(id).toBe(`usuari-nou1-enllac-${ARA}`);
    expect(correu.to).toBe('pere@example.com');
    // Caduca als 7 dies (rellotge injectat del servidor), abans que els altres correus.
    expect(RETENCIO_CORREUS_ENLLAC).toBe(7 * 24 * 60 * 60 * 1000);
    expect(correu.expireAt).toEqual(new Date(ARA + 7 * 24 * 60 * 60 * 1000));
    expect(correu.message.html).toContain('Hola Pere Vidal');
    expect(correu.message.html).toContain('oobCode=SECRET&amp;x=&lt;y&gt;');
    expect(correu.message.html).not.toContain(props.password);

    expect(deps.db.auditoria).toEqual([{
      accio: 'crear', actorUid: 'admin1', actorCorreu: 'admin@cineclub.cat', objectiuUid: 'nou1', objectiuCorreu: 'pere@example.com', timestamp: 'SERVER_TS',
    }]);
    expect(totElRegistre(deps)).not.toContain(props.password);
    expect(totElRegistre(deps)).not.toContain('SECRET');
  });

  it('cada compte té una contrasenya aleatòria diferent', async () => {
    const deps = entorn();
    await crear(deps, ADMIN, { nom: 'A', correu: 'a@example.com' });
    await crear(deps, ADMIN, { nom: 'B', correu: 'b@example.com' });
    const [p1, p2] = deps.auth.crides.filter(([c]) => c === 'createUser').map(([, p]) => p.password);
    expect(p1).not.toBe(p2);
  });

  it.each([
    [{ nom: '', correu: 'a@example.com' }],
    [{ nom: 'x'.repeat(81), correu: 'a@example.com' }],
    [{ nom: 'Anna', correu: 'no-es-correu' }],
    [{ nom: 'Anna', correu: 'a@b' }],
    [{ nom: 'Anna', correu: 'a@example.com\nBcc: x@y.com' }],
    [{ nom: 42, correu: 'a@example.com' }],
  ])('valida les dades (%j)', async (dades) => {
    const deps = entorn();
    await expect(crear(deps, ADMIN, dades)).rejects.toMatchObject({ codi: 'invalid-argument' });
    expect(deps.auth.createUser).not.toHaveBeenCalled();
  });

  it.each([['t1@example.com', 'de taquilla'], ['adm@example.com', 'd\'un admin'], ['CAP@example.com', 'sense rol']])(
    'correu ja en ús (%s, %s) → already-exists sense revelar el rol',
    async (correu) => {
      const deps = entorn();
      const e = await crear(deps, ADMIN, { nom: 'Anna', correu }).catch((x) => x);
      expect(e).toMatchObject({ codi: 'already-exists', message: 'Aquest correu ja està en ús.' });
      expect(deps.auth.createUser).not.toHaveBeenCalled();
      expect(deps.auth.setCustomUserClaims).not.toHaveBeenCalled();
    }
  );

  it('si Auth diu que el correu ja existeix en crear (cursa) → already-exists', async () => {
    const deps = entorn();
    deps.auth.createUser.mockRejectedValueOnce(errorAuth('auth/email-already-exists'));
    await expect(crear(deps, ADMIN, { nom: 'Anna', correu: 'anna@example.com' })).rejects.toMatchObject({ codi: 'already-exists' });
  });

  it(`no en deixa crear més de ${LIMIT_USUARIS} en total`, async () => {
    const molts = Array.from({ length: LIMIT_USUARIS }, (_, i) => usuari(`t${i}`));
    const deps = entorn({ usuaris: [...molts, usuari('adm', { customClaims: { role: 'admin' } })] });
    await expect(crear(deps, ADMIN, { nom: 'Anna', correu: 'anna@example.com' })).rejects.toMatchObject({ codi: 'resource-exhausted' });
    expect(deps.auth.createUser).not.toHaveBeenCalled();
  });

  it(`no en deixa crear més de ${LIMIT_CREACIONS_HORA} en una hora (només compten les creacions)`, async () => {
    const creacions = Array.from({ length: LIMIT_CREACIONS_HORA }, () => ({ accio: 'crear' }));
    const deps = entorn({ auditoriaRecent: creacions });
    await expect(crear(deps, ADMIN, { nom: 'Anna', correu: 'anna@example.com' })).rejects.toMatchObject({ codi: 'resource-exhausted' });
    expect(deps.db.consultes).toEqual([['timestamp', '>=', new Date(ARA - 60 * 60 * 1000)]]);
    expect(deps.auth.createUser).not.toHaveBeenCalled();

    const altres = entorn({ auditoriaRecent: [...creacions.slice(1), ...Array(20).fill({ accio: 'eliminar' })] });
    await expect(crear(altres, ADMIN, { nom: 'Anna', correu: 'anna@example.com' })).resolves.toMatchObject({ uid: 'nou1' });
  });

  it('si no es pot posar el rol, esborra el compte creat', async () => {
    const deps = entorn();
    deps.auth.setCustomUserClaims.mockRejectedValueOnce(new Error('boom'));
    await expect(crear(deps, ADMIN, { nom: 'Anna', correu: 'anna@example.com' })).rejects.toThrow('boom');
    expect(deps.auth.deleteUser).toHaveBeenCalledWith('nou1');
    expect(deps.db.auditoria).toEqual([]);
  });

  it('si el registre d\'auditoria falla, l\'usuari queda creat, s\'envia l\'enllaç i només es registra uid i codi', async () => {
    const deps = entorn();
    const original = deps.db.collection.bind(deps.db);
    deps.db.collection = (nom) => (nom === 'auditoriaUsuaris'
      ? { ...original(nom), add: async () => { throw Object.assign(new Error(`permís denegat ${ENLLAC}`), { code: 7 }); } }
      : original(nom));
    expect(await crear(deps, ADMIN, { nom: 'Anna', correu: 'anna@example.com' })).toEqual({ uid: 'nou1', enllac: ENLLAC, correuEnviat: true });
    expect(deps.db.mail.size).toBe(1);
    expect(deps.logger.error.mock.calls).toEqual([[expect.any(String), { uid: 'nou1', codi: 7 }]]);
    expect(totElRegistre(deps)).not.toContain('SECRET');
  });

  it('registra l\'alta abans d\'enviar el correu', async () => {
    const deps = entorn();
    const ordre = [];
    const original = deps.db.collection.bind(deps.db);
    deps.db.collection = (nom) => {
      const col = original(nom);
      if (nom === 'auditoriaUsuaris') return { ...col, add: async (d) => { ordre.push('auditoria'); return col.add(d); } };
      return { doc: (id) => ({ create: async (d) => { ordre.push('mail'); return col.doc(id).create(d); } }) };
    };
    await crear(deps, ADMIN, { nom: 'Anna', correu: 'anna@example.com' });
    expect(ordre).toEqual(['auditoria', 'mail']);
  });

  it('si el correu no es pot enviar, torna igualment l\'enllaç perquè l\'admin el pugui copiar', async () => {
    const deps = entorn();
    deps.db.collection = ((original) => (nom) => (nom === 'mail'
      ? { doc: () => ({ create: async () => { throw new Error('sense quota'); } }) }
      : original(nom)))(deps.db.collection.bind(deps.db));
    const r = await crear(deps, ADMIN, { nom: 'Anna', correu: 'anna@example.com' });
    expect(r).toEqual({ uid: 'nou1', enllac: ENLLAC, correuEnviat: false });
    expect(totElRegistre(deps)).not.toContain('SECRET');
  });

  it('si no es pot generar l\'enllaç, el compte queda creat i es diu', async () => {
    const deps = entorn();
    deps.auth.generatePasswordResetLink.mockRejectedValueOnce(errorAuth('auth/internal-error'));
    expect(await crear(deps, ADMIN, { nom: 'Anna', correu: 'anna@example.com' })).toEqual({ uid: 'nou1', enllac: null, correuEnviat: false });
    expect(deps.db.mail.size).toBe(0);
  });
});

describe('editar', () => {
  it('canvia només el nom sense revocar ni enviar res', async () => {
    const deps = entorn();
    const r = await editar(deps, ADMIN, { uid: 't1', nom: 'Anna Puig', correu: 'T1@example.com' });
    expect(r).toEqual({ enllac: null, correuEnviat: false });
    expect(deps.auth.updateUser).toHaveBeenCalledWith('t1', { displayName: 'Anna Puig' });
    expect(deps.auth.revokeRefreshTokens).not.toHaveBeenCalled();
    expect(deps.db.mail.size).toBe(0);
    expect(deps.db.auditoria).toEqual([expect.objectContaining({
      accio: 'editar', objectiuUid: 't1', detalls: { nomAnterior: 'Nom t1', correuAnterior: 't1@example.com' },
    })]);
  });

  it('sense canvis no fa res', async () => {
    const deps = entorn();
    await editar(deps, ADMIN, { uid: 't1', nom: 'Nom t1', correu: 't1@example.com' });
    expect(deps.auth.updateUser).not.toHaveBeenCalled();
    expect(deps.db.auditoria).toEqual([]);
  });

  it('canvia el correu: el marca com a no verificat, revoca les sessions i envia l\'enllaç a la nova adreça', async () => {
    const deps = entorn();
    const r = await editar(deps, ADMIN, { uid: 't1', nom: 'Nom t1', correu: 'nou@example.com' });
    expect(r).toEqual({ enllac: ENLLAC, correuEnviat: true });
    const [[, props]] = deps.auth.updateUser.mock.calls;
    expect(props).toEqual({
      displayName: 'Nom t1', email: 'nou@example.com', emailVerified: false, password: expect.any(String),
    });
    // Contrasenya nova i aleatòria: l'antiga no serveix amb la nova adreça. No surt enlloc.
    expect(props.password.length).toBeGreaterThanOrEqual(32);
    expect(JSON.stringify(r)).not.toContain(props.password);
    expect(JSON.stringify([...deps.db.mail.values(), ...deps.db.auditoria])).not.toContain(props.password);
    expect(totElRegistre(deps)).not.toContain(props.password);
    expect(deps.auth.revokeRefreshTokens).toHaveBeenCalledWith('t1');
    expect(deps.auth.setCustomUserClaims).not.toHaveBeenCalled();
    expect(deps.auth.generatePasswordResetLink).toHaveBeenCalledWith('nou@example.com', expect.anything());
    expect([...deps.db.mail.values()][0]).toMatchObject({ to: 'nou@example.com', expireAt: new Date(ARA + RETENCIO_CORREUS_ENLLAC) });
    expect(deps.db.auditoria.map((a) => a.accio)).toEqual(['editar', 'enviar-enllac']);
    expect(deps.db.auditoria[0]).toMatchObject({ objectiuCorreu: 'nou@example.com', detalls: { correuAnterior: 't1@example.com' } });
    expect(totElRegistre(deps)).not.toContain('SECRET');
  });

  it('correu nou ja en ús → already-exists i no canvia res', async () => {
    const deps = entorn();
    await expect(editar(deps, ADMIN, { uid: 't1', nom: 'Nom t1', correu: 'adm@example.com' }))
      .rejects.toMatchObject({ codi: 'already-exists', message: 'Aquest correu ja està en ús.' });
    expect(deps.auth.updateUser).not.toHaveBeenCalled();
  });

  it('valida nom i correu abans de consultar res', async () => {
    const deps = entorn();
    await expect(editar(deps, ADMIN, { uid: 't1', nom: '', correu: 'a@example.com' })).rejects.toMatchObject({ codi: 'invalid-argument' });
    await expect(editar(deps, ADMIN, { uid: 't1', nom: 'A', correu: 'dolent' })).rejects.toMatchObject({ codi: 'invalid-argument' });
    expect(deps.auth.getUser).not.toHaveBeenCalledWith('t1');
  });
});

describe('canviarEstat', () => {
  it('desactivar: desactiva, revoca les sessions i ho audita', async () => {
    const deps = entorn();
    expect(await canviarEstat(deps, ADMIN, { uid: 't1', desactivat: true })).toEqual({ desactivat: true });
    expect(deps.auth.crides).toEqual([['updateUser', 't1', { disabled: true }], ['revokeRefreshTokens', 't1']]);
    expect(deps.db.auditoria).toEqual([expect.objectContaining({ accio: 'desactivar', objectiuUid: 't1', objectiuCorreu: 't1@example.com' })]);
  });

  it('reactivar: el torna a activar', async () => {
    const deps = entorn({ usuaris: [usuari('t1', { disabled: true })] });
    await canviarEstat(deps, ADMIN, { uid: 't1', desactivat: false });
    expect(deps.auth.crides).toEqual([['updateUser', 't1', { disabled: false }]]);
    expect(deps.db.auditoria[0].accio).toBe('reactivar');
  });

  it.each([undefined, 'true', 1])('desactivat ha de ser booleà (%s)', async (desactivat) => {
    const deps = entorn();
    await expect(canviarEstat(deps, ADMIN, { uid: 't1', desactivat })).rejects.toMatchObject({ codi: 'invalid-argument' });
  });
});

describe('restablirContrasenya', () => {
  it('anul·la la contrasenya, talla les sessions, envia un enllaç nou, el torna i ho audita sense l\'enllaç', async () => {
    const deps = entorn();
    const r = await restablirContrasenya(deps, ADMIN, { uid: 't1' });
    expect(r).toEqual({ enllac: ENLLAC, correuEnviat: true });
    const [[accio, uid, props], revocacio] = deps.auth.crides;
    expect([accio, uid, Object.keys(props)]).toEqual(['updateUser', 't1', ['password']]);
    expect(props.password.length).toBeGreaterThanOrEqual(32);
    expect(revocacio).toEqual(['revokeRefreshTokens', 't1']);
    expect(JSON.stringify([r, ...deps.db.mail.values(), ...deps.db.auditoria])).not.toContain(props.password);
    expect(totElRegistre(deps)).not.toContain(props.password);
    expect([...deps.db.mail.keys()]).toEqual([`usuari-t1-enllac-${ARA}`]);
    expect([...deps.db.mail.values()][0].expireAt).toEqual(new Date(ARA + RETENCIO_CORREUS_ENLLAC));
    expect(deps.db.auditoria).toEqual([expect.objectContaining({ accio: 'restablir-contrasenya', objectiuUid: 't1' })]);
    expect(JSON.stringify(deps.db.auditoria)).not.toContain('SECRET');
    expect(totElRegistre(deps)).not.toContain('SECRET');
  });

  it('cada cop una contrasenya diferent', async () => {
    const deps = entorn();
    await restablirContrasenya(deps, ADMIN, { uid: 't1' });
    await restablirContrasenya(deps, ADMIN, { uid: 't1' });
    const [a, b] = deps.auth.updateUser.mock.calls.map(([, p]) => p.password);
    expect(a).not.toBe(b);
  });

  it('si no es pot generar l\'enllaç, la contrasenya ja és anul·lada (i auditada) i es diu', async () => {
    const deps = entorn();
    deps.auth.generatePasswordResetLink.mockRejectedValueOnce(errorAuth('auth/internal-error'));
    await expect(restablirContrasenya(deps, ADMIN, { uid: 't1' })).rejects.toMatchObject({ codi: 'aborted' });
    expect(deps.auth.revokeRefreshTokens).toHaveBeenCalledWith('t1');
    expect(deps.db.auditoria.map((a) => a.accio)).toEqual(['restablir-contrasenya']);
  });

  it('no en genera per a un usuari desactivat', async () => {
    const deps = entorn({ usuaris: [usuari('t1', { disabled: true })] });
    await expect(restablirContrasenya(deps, ADMIN, { uid: 't1' })).rejects.toMatchObject({ codi: 'failed-precondition' });
    expect(deps.auth.generatePasswordResetLink).not.toHaveBeenCalled();
    expect(deps.auth.updateUser).not.toHaveBeenCalled();
  });
});

describe('eliminar', () => {
  it('esborra el compte i ho audita', async () => {
    const deps = entorn();
    expect(await eliminar(deps, ADMIN, { uid: 't1' })).toEqual({ eliminat: true });
    expect(deps.auth.usuaris.has('t1')).toBe(false);
    expect(deps.db.auditoria).toEqual([{
      accio: 'eliminar', actorUid: 'admin1', actorCorreu: 'admin@cineclub.cat', objectiuUid: 't1', objectiuCorreu: 't1@example.com', timestamp: 'SERVER_TS',
    }]);
  });
});

describe('executar (embolcall de les callables a index.js)', () => {
  class HttpsErrorFals extends Error {
    constructor(code, message) { super(message); this.code = code; }
  }

  it('passa els errors propis amb el seu codi i missatge', async () => {
    const deps = entorn();
    const e = await executar(llistar, deps, { auth: undefined, data: {} }, HttpsErrorFals).catch((x) => x);
    expect(e).toBeInstanceOf(HttpsErrorFals);
    expect([e.code, e.message]).toEqual(['unauthenticated', 'Cal iniciar la sessió.']);
  });

  it('qualsevol altre error surt com a INTERNAL sense detalls, i al registre només el codi', async () => {
    const deps = entorn();
    const gestor = async () => { throw Object.assign(new Error(`ha petat amb ${ENLLAC} i contrasenya XYZ`), { code: 'auth/internal-error' }); };
    const e = await executar(gestor, deps, { auth: ADMIN, data: {} }, HttpsErrorFals).catch((x) => x);
    expect([e.code, e.message]).toEqual(['internal', 'Error intern.']);
    expect(deps.logger.error.mock.calls).toEqual([[expect.any(String), { codi: 'auth/internal-error' }]]);
    expect(totElRegistre(deps)).not.toMatch(/SECRET|XYZ/);
  });

  it('passa auth i dades al gestor (dades buides si no n\'hi ha)', async () => {
    const gestor = vi.fn(async () => 'ok');
    const deps = entorn();
    expect(await executar(gestor, deps, { auth: ADMIN }, HttpsErrorFals)).toBe('ok');
    expect(gestor).toHaveBeenCalledWith(deps, ADMIN, {});
  });
});
