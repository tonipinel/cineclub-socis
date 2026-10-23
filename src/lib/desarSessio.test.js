import { describe, it, expect, vi } from 'vitest';
import { prepararDesat, campsCanviats, CAMPS_INICIALS, MISSATGE_ALIAS } from './desarSessio';
import { publicaAFormulari, urlPublica, ERROR_DESCRIPCIO } from './sessioPublica';

const ARA = new Date('2026-10-23T10:00:00Z');
const formBuit = publicaAFormulari(undefined);

const preparar = (parametres) => prepararDesat({
  id: 's1',
  publicaForm: formBuit,
  publicaInicial: formBuit,
  altresSessions: [],
  ara: ARA,
  confirmarAlias: () => true,
  ...parametres,
});

describe('prepararDesat', () => {
  it('sessió antiga sense publica: només es desa el camp canviat', async () => {
    const original = { titol: 'Vell', data: '2026-01-10', hora: '19:00', urlProgramacio: '', imatgeUrl: '', activa: true };
    const r = await preparar({ original, dades: { ...CAMPS_INICIALS, ...original, titol: 'Nou' } });
    expect(r.errors).toEqual({});
    expect(r.cancelat).toBe(false);
    expect(r.canvis).toEqual({ titol: 'Nou' });
    expect(r.publicaFinal).toBeUndefined();
  });

  it('no inclou mai activa, ni a dadesADesar ni a canvis', async () => {
    const original = { titol: 'Vell', activa: false };
    const r = await preparar({ original, dades: { ...CAMPS_INICIALS, ...original, titol: 'Nou', activa: true } });
    expect(r.dadesADesar).not.toHaveProperty('activa');
    expect(r.canvis).toEqual({ titol: 'Nou' });
  });

  it('publicar per primer cop fixa urlProgramacio amb la URL pública', async () => {
    const original = { titol: 'Peli', data: '2026-03-05', hora: '19:00', urlProgramacio: '', imatgeUrl: '' };
    const r = await preparar({
      original,
      dades: { ...CAMPS_INICIALS, ...original, publicada: true, slug: 'peli' },
      publicaForm: { ...formBuit, titol: 'Peli' },
    });
    expect(r.errors).toEqual({});
    expect(r.canvis.urlProgramacio).toBe(urlPublica('2026-03-05', 'peli'));
    expect(r.canvis.publicada).toBe(true);
    expect(r.canvis.slug).toBe('peli');
  });

  it('camí públic canviat: demana confirmació; si es refusa, cancel·la', async () => {
    const original = { titol: 'Peli', data: '2026-03-05', publicada: true, slug: 'peli' };
    const confirmarAlias = vi.fn(() => false);
    const r = await preparar({ original, dades: { ...CAMPS_INICIALS, ...original, data: '2027-03-05' }, confirmarAlias });
    expect(confirmarAlias).toHaveBeenCalledTimes(1);
    expect(r.cancelat).toBe(true);
    expect(r.errors).toEqual({});
  });

  it('camí públic canviat: si s\'accepta, afegeix l\'alias i marca actualitzada', async () => {
    const original = { titol: 'Peli', data: '2026-03-05', publicada: true, slug: 'peli' };
    const confirmarAlias = vi.fn(() => true);
    const r = await preparar({ original, dades: { ...CAMPS_INICIALS, ...original, data: '2027-03-05' }, confirmarAlias });
    expect(r.cancelat).toBe(false);
    expect(r.publicaFinal.aliases).toEqual(['/programacio/2026/peli/']);
    expect(r.publicaFinal.actualitzatEl).toBe('2026-10-23');
    expect(r.canvis.urlProgramacio).toBe(urlPublica('2027-03-05', 'peli'));
    expect(r.canvis.publica).toEqual(r.publicaFinal);
  });

  it('fitxa pública sense tocar amb descripció llarga: cap error; canviada en publicar: error descripcio', async () => {
    const original = { titol: 'Peli', data: '2026-03-05' };
    const form = { ...formBuit, titol: 'Peli', descripcio: 'a'.repeat(200) };
    const dades = { ...CAMPS_INICIALS, ...original };
    const intacta = await preparar({ original, dades, publicaForm: form, publicaInicial: form });
    expect(intacta.errors).toEqual({});
    expect(intacta.publicaFinal).toBeUndefined();
    const canviada = await preparar({
      original, dades: { ...dades, publicada: true, slug: 'peli' }, publicaForm: form, publicaInicial: formBuit,
    });
    expect(canviada.errors).toEqual({ descripcio: ERROR_DESCRIPCIO });
  });

  it('només avisa de la descripció llarga en publicar per primer cop', async () => {
    const form = { ...formBuit, descripcio: 'a'.repeat(200) };
    const original = { titol: 'Peli', data: '2026-03-05', slug: 'peli', publicada: true };
    const r = await preparar({
      original,
      dades: { ...CAMPS_INICIALS, ...original, titol: 'Peli 2' },
      publicaForm: form,
      publicaInicial: form,
    });
    expect(r.errors).toEqual({});
    const primer = await preparar({
      original: { ...original, publicada: false },
      dades: { ...CAMPS_INICIALS, ...original },
      publicaForm: form,
      publicaInicial: form,
    });
    expect(primer.errors).toEqual({ descripcio: ERROR_DESCRIPCIO });
  });

  it('slug repetit en publicar: errors.publicar.slug', async () => {
    const original = { titol: 'Peli', data: '2026-03-05' };
    const r = await preparar({
      original,
      dades: { ...CAMPS_INICIALS, ...original, publicada: true, slug: 'peli' },
      altresSessions: [{ id: 'altra', slug: 'peli', data: '2026-09-09' }],
    });
    expect(r.errors.publicar).toEqual({ slug: 'Ja hi ha una altra sessió amb aquest slug el mateix any.' });
    expect(r.cancelat).toBe(false);
  });

  it('no valida res de publicable si no està publicada', async () => {
    const original = { titol: 'Peli' };
    const r = await preparar({ original, dades: { ...CAMPS_INICIALS, ...original, titol: 'Peli 2', slug: '' }, altresSessions: [] });
    expect(r.errors).toEqual({});
  });

  it('errors de la fitxa pública no arriben a demanar l\'alias', async () => {
    const original = { titol: 'Peli', data: '2026-03-05', publicada: true, slug: 'peli' };
    const confirmarAlias = vi.fn(() => true);
    const r = await preparar({
      original,
      dades: { ...CAMPS_INICIALS, ...original, data: '2027-03-05' },
      publicaForm: { ...formBuit, preu: 'x' },
      confirmarAlias,
    });
    expect(Object.keys(r.errors)).toEqual(['preu']);
    expect(confirmarAlias).not.toHaveBeenCalled();
  });

  it('confirmarAlias pot tornar una promesa: si es resol a false, cancel·la sense canvis', async () => {
    const original = { titol: 'Peli', data: '2026-03-05', publicada: true, slug: 'peli' };
    const confirmarAlias = vi.fn(() => Promise.resolve(false));
    const r = await preparar({ original, dades: { ...CAMPS_INICIALS, ...original, data: '2027-03-05' }, confirmarAlias });
    expect(confirmarAlias).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ errors: {}, cancelat: true, dadesADesar: {}, canvis: {}, publicaFinal: undefined });
  });

  it('confirmarAlias pot tornar una promesa: si es resol a true, afegeix l\'alias', async () => {
    const original = { titol: 'Peli', data: '2026-03-05', publicada: true, slug: 'peli' };
    const confirmarAlias = vi.fn(() => Promise.resolve(true));
    const r = await preparar({ original, dades: { ...CAMPS_INICIALS, ...original, data: '2027-03-05' }, confirmarAlias });
    expect(r.cancelat).toBe(false);
    expect(r.publicaFinal.aliases).toEqual(['/programacio/2026/peli/']);
    expect(r.canvis.urlProgramacio).toBe(urlPublica('2027-03-05', 'peli'));
  });

  it('cartell canviat: imatgeUrl passa a ser el cartell', async () => {
    const original = { titol: 'Peli', data: '2026-03-05', imatgeUrl: 'vella.jpg' };
    const r = await preparar({
      original,
      dades: { ...CAMPS_INICIALS, ...original },
      publicaForm: { ...formBuit, cartell: 'https://x/nou.jpg' },
    });
    expect(r.publicaFinal.cartell).toBe('https://x/nou.jpg');
    expect(r.canvis.imatgeUrl).toBe('https://x/nou.jpg');
    expect(r.canvis.publica.actualitzatEl).toBe('2026-10-23');
  });

  it('MISSATGE_ALIAS i CAMPS_INICIALS s\'exporten amb els valors originals', async () => {
    expect(MISSATGE_ALIAS).toBe("Això trencarà l'URL anterior; s'afegirà com a alias perquè continuï funcionant.");
    expect(CAMPS_INICIALS).toEqual({ titol: '', data: '', hora: '19:00', urlProgramacio: '', imatgeUrl: '' });
  });
});

describe('campsCanviats', () => {
  it('llista els camps diferents i ignora activa', () => {
    const original = { titol: 'A', data: '2026-01-01', activa: false };
    const dades = { ...CAMPS_INICIALS, ...original, titol: 'B', activa: true };
    const publicaForm = { ...formBuit, hook: 'x' };
    expect(campsCanviats(dades, original, publicaForm, formBuit)).toEqual({ dades: ['titol'], publica: ['hook'] });
  });

  it('sense canvis retorna llistes buides', () => {
    const original = { titol: 'A', activa: true };
    expect(campsCanviats({ ...CAMPS_INICIALS, ...original, activa: false }, original, formBuit, formBuit))
      .toEqual({ dades: [], publica: [] });
  });
});
