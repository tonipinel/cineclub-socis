// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../src/firebase/client.js', () => ({ db: {}, functions: {} }));
vi.mock('../../src/components/propostes/LectorCarnet.jsx', () => ({
  default: ({ onIdentificat }) => (
    <button type="button" onClick={() => onIdentificat({ numeroSoci: 7, nomPublic: 'Isabel M.', token: 'tok-7' })}>
      Simular escaneig
    </button>
  ),
}));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_, nom) => nom),
  query: vi.fn((collectionName, ...constraints) => ({ collectionName, constraints })),
  where: vi.fn((field, op, value) => ({ field, op, value })),
  getDocs: vi.fn(),
}));
vi.mock('../../src/lib/propostes/votacio.js', () => ({
  carregarEstat: vi.fn(),
  votar: vi.fn(),
  carregarRanking: vi.fn(),
  ordreBarrejat: vi.fn((ids) => [...ids]),
}));

import { collection, getDocs } from 'firebase/firestore';
import { carregarEstat, carregarRanking } from '../../src/lib/propostes/votacio.js';
import IllaVotar from '../../src/components/propostes/IllaVotar.jsx';

const IDENTITAT = { numeroSoci: 7, nomPublic: 'Isabel M.', token: 'tok-7' };
const APROVADES = [
  { id: 'p1', dades: { titol: 'Amélie', estat: 'aprovada', numeroSoci: 3, sinopsi: 'Una noia parisenca.' } },
  { id: 'p2', dades: { titol: 'El padrí', estat: 'aprovada', numeroSoci: 5 } },
  { id: 'p3', dades: { titol: 'Stalker', estat: 'aprovada', numeroSoci: 5 } },
  { id: 'p4', dades: { titol: 'Fora de tanda', estat: 'aprovada', numeroSoci: 5 } },
];
const FUTUR = new Date('2099-01-01T00:00:00Z');
const PASSAT = new Date('2020-01-01T00:00:00Z');

function mockFirestore({ propostes = APROVADES, tandes = [], propostesFallen = false, tandesFallen = false } = {}) {
  getDocs.mockImplementation((q) => {
    const nom = q?.collectionName ?? q;
    if (nom === 'propostes') {
      return propostesFallen
        ? Promise.reject(new Error('xarxa'))
        : Promise.resolve({ docs: propostes.map((p) => ({ id: p.id, data: () => p.dades })) });
    }
    if (nom === 'tandes') {
      if (tandesFallen) return Promise.reject(new Error('xarxa'));
      return Promise.resolve({
        docs: tandes.map((t) => ({
          id: t.id,
          data: () => ({
            nom: t.nom,
            tanca: { toDate: () => t.tanca },
            creada: { toDate: () => new Date('2026-01-01') },
            propostes: t.propostes,
          }),
        })),
      });
    }
    return Promise.resolve({ docs: [] });
  });
}

const tandaOberta = { id: 't1', nom: 'Q4 2026', tanca: FUTUR, propostes: ['p1', 'p2', 'p3'] };
const estatObert = (extra = {}) => ({
  tanda: { id: 't1', nom: 'Q4 2026', tanca: '2099-01-01T00:00:00.000Z', tancada: false, propostes: ['p1', 'p2', 'p3'] },
  valors: {},
  bloquejat: false,
  completa: false,
  ...extra,
});
const estatTancat = () => estatObert({ tanda: { ...estatObert().tanda, tancada: true, tanca: '2020-01-01T00:00:00.000Z' } });
const errorCallable = (codi) => Object.assign(new Error(codi), { code: `functions/${codi}` });

describe('IllaVotar (/propostes/votar/)', () => {
  beforeEach(() => {
    getDocs.mockReset();
    collection.mockClear();
    carregarEstat.mockReset();
    carregarRanking.mockReset();
    carregarEstat.mockResolvedValue(estatObert());
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('sense identitat', () => {
    it('mostra el títol amb el nom de la tanda, la frase, el lector i l\'enllaç per fer-se soci/a', async () => {
      mockFirestore({ tandes: [tandaOberta] });
      render(<IllaVotar />);
      expect(await screen.findByRole('heading', { level: 1, name: 'Vota les propostes de Q4 2026' })).toBeInTheDocument();
      expect(screen.getByText('Escaneja el teu carnet de soci/a per començar. Només et portarà un moment.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Simular escaneig' })).toBeInTheDocument();
      expect(screen.getByText(/Encara no ets soci\/a\?/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Fes-te soci/a' })).toHaveAttribute('href', '/fes-te-socia/');
    });

    it('mentre no se sap si hi ha tanda oberta mostra «Carregant» i no munta el lector (no demana la càmera)', async () => {
      getDocs.mockImplementation(() => new Promise(() => {}));
      const { container } = render(<IllaVotar />);
      expect(container.querySelector('.carregant')).not.toBeNull();
      expect(screen.queryByRole('button', { name: 'Simular escaneig' })).not.toBeInTheDocument();
    });

    it('quan se sap que hi ha tanda oberta, desapareix «Carregant» i apareix el lector', async () => {
      mockFirestore({ tandes: [tandaOberta] });
      const { container } = render(<IllaVotar />);
      expect(await screen.findByRole('button', { name: 'Simular escaneig' })).toBeInTheDocument();
      expect(container.querySelector('.carregant')).toBeNull();
    });

    it('si la tanda no té nom, el títol és el genèric', async () => {
      mockFirestore({ tandes: [{ ...tandaOberta, nom: undefined }] });
      render(<IllaVotar />);
      await waitFor(() => expect(getDocs).toHaveBeenCalledTimes(2));
      expect(await screen.findByRole('heading', { level: 1, name: 'Vota les propostes del Cineclub' })).toBeInTheDocument();
    });

    it('no mostra llista de propostes, pestanyes ni vots', async () => {
      mockFirestore({ tandes: [tandaOberta] });
      render(<IllaVotar />);
      await screen.findByRole('heading', { name: /Vota les propostes de Q4 2026/ });
      expect(screen.queryByText('Amélie')).not.toBeInTheDocument();
      expect(screen.queryByRole('tab')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /m'agrada/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    it('no llegeix ni escriu mai vots (només propostes i tandes)', async () => {
      mockFirestore({ tandes: [tandaOberta] });
      render(<IllaVotar />);
      await screen.findByRole('heading', { name: /Vota les propostes de Q4 2026/ });
      const noms = collection.mock.calls.map((c) => c[c.length - 1]);
      expect(noms.length).toBeGreaterThan(0);
      for (const nom of noms) expect(['propostes', 'tandes']).toContain(nom);
    });

    it('en escanejar el carnet passa directament al mode votació (barra de progrés i primera fitxa)', async () => {
      mockFirestore({ tandes: [tandaOberta] });
      render(<IllaVotar />);
      await userEvent.click(await screen.findByRole('button', { name: 'Simular escaneig' }));
      expect(await screen.findByRole('progressbar')).toBeInTheDocument();
      expect(screen.getByText('Has votat 0 de 3')).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 2, name: 'Amélie' })).toBeInTheDocument();
      expect(carregarEstat).toHaveBeenCalledWith('tok-7');
      expect(screen.queryByText('Escaneja el teu carnet de soci/a per començar. Només et portarà un moment.')).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Fes-te soci/a' })).not.toBeInTheDocument();
      expect(screen.getByText(/Identificat com:/)).toBeInTheDocument();
      expect(sessionStorage.getItem('cineclub.identitat')).toContain('tok-7');
    });

    it('amb un carnet no vàlid torna a l\'entrada amb el missatge d\'error', async () => {
      mockFirestore({ tandes: [tandaOberta] });
      carregarEstat.mockRejectedValue(errorCallable('permission-denied'));
      render(<IllaVotar />);
      await userEvent.click(await screen.findByRole('button', { name: 'Simular escaneig' }));
      expect(await screen.findByText('Aquest carnet no és vàlid. Torna a escanejar-lo.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Simular escaneig' })).toBeInTheDocument();
      expect(sessionStorage.getItem('cineclub.identitat')).toBeNull();
    });

    it('sense cap tanda oberta mostra el missatge i l\'enllaç a les propostes, sense lector', async () => {
      mockFirestore({ tandes: [] });
      render(<IllaVotar />);
      expect(await screen.findByText('Ara mateix no hi ha cap votació oberta.')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Veure les propostes' })).toHaveAttribute('href', '/propostes/');
      expect(screen.queryByRole('button', { name: 'Simular escaneig' })).not.toBeInTheDocument();
    });

    it('amb la darrera tanda ja tancada, el visitant veu el mateix missatge', async () => {
      mockFirestore({ tandes: [{ ...tandaOberta, tanca: PASSAT }] });
      render(<IllaVotar />);
      expect(await screen.findByText('Ara mateix no hi ha cap votació oberta.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /rànquing/i })).not.toBeInTheDocument();
    });

    it('si falla la lectura de la tanda mostra l\'error amb «Tornar a provar», que ho torna a intentar', async () => {
      mockFirestore({ tandesFallen: true });
      render(<IllaVotar />);
      expect(await screen.findByText(/No s'han pogut carregar les propostes/)).toBeInTheDocument();
      expect(screen.queryByText('Ara mateix no hi ha cap votació oberta.')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Sortir' })).not.toBeInTheDocument();
      mockFirestore({ tandes: [tandaOberta] });
      await userEvent.click(screen.getByRole('button', { name: 'Tornar a provar' }));
      expect(await screen.findByRole('heading', { name: 'Vota les propostes de Q4 2026' })).toBeInTheDocument();
      expect(screen.queryByText('Ara mateix no hi ha cap votació oberta.')).not.toBeInTheDocument();
    });

    it('si falla la càrrega de les propostes mostra l\'error amb «Tornar a provar»', async () => {
      mockFirestore({ tandes: [tandaOberta], propostesFallen: true });
      render(<IllaVotar />);
      expect(await screen.findByText(/No s'han pogut carregar les propostes/)).toBeInTheDocument();
      mockFirestore({ tandes: [tandaOberta] });
      await userEvent.click(screen.getByRole('button', { name: 'Tornar a provar' }));
      expect(await screen.findByRole('button', { name: 'Simular escaneig' })).toBeInTheDocument();
    });
  });

  describe('amb identitat a sessionStorage', () => {
    beforeEach(() => {
      sessionStorage.setItem('cineclub.identitat', JSON.stringify(IDENTITAT));
    });

    it('salta l\'escàner i va directament al mode votació, sense hero ni llista', async () => {
      mockFirestore({ tandes: [tandaOberta] });
      render(<IllaVotar />);
      expect(await screen.findByRole('progressbar')).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 2, name: 'Amélie' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Simular escaneig' })).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
      expect(screen.queryByText('Fora de tanda')).not.toBeInTheDocument();
      expect(screen.getByText(/Els teus vots només els veu la junta/)).toBeInTheDocument();
    });

    it('sense votació, el soci identificat veu «Identificat com: … · Sortir» i «Sortir» esborra la identitat', async () => {
      mockFirestore();
      carregarEstat.mockResolvedValue({ tanda: null });
      render(<IllaVotar />);
      await screen.findByText('Ara mateix no hi ha cap votació oberta.');
      expect(document.querySelector('.votacio__identitat')).toHaveTextContent('Identificat com: Isabel M.');
      expect(document.querySelector('.votacio__nom')).toHaveAttribute('title', 'Isabel M.');
      await userEvent.click(screen.getByRole('button', { name: 'Sortir: deixar de votar com a Isabel M.' }));
      expect(sessionStorage.getItem('cineclub.identitat')).toBeNull();
      expect(document.querySelector('.votacio__identitat')).toBeNull();
    });

    it('amb la tanda tancada, la línia d\'identitat també hi és (el rànquing mostra vots individuals)', async () => {
      mockFirestore({ tandes: [{ ...tandaOberta, tanca: PASSAT }] });
      carregarEstat.mockResolvedValue(estatTancat());
      render(<IllaVotar />);
      await screen.findByText('Ara mateix no hi ha cap votació oberta.');
      expect(document.querySelector('.votacio__identitat')).toHaveTextContent('Identificat com: Isabel M.');
      expect(screen.getAllByRole('button', { name: /^Sortir/ })).toHaveLength(1);
    });

    it('sense identitat (visitant) no hi ha cap línia d\'identitat', async () => {
      sessionStorage.clear();
      mockFirestore({ tandes: [] });
      render(<IllaVotar />);
      await screen.findByText('Ara mateix no hi ha cap votació oberta.');
      expect(document.querySelector('.votacio__identitat')).toBeNull();
    });

    it('sense tanda mostra el missatge i l\'enllaç a les propostes', async () => {
      mockFirestore();
      carregarEstat.mockResolvedValue({ tanda: null });
      render(<IllaVotar />);
      expect(await screen.findByText('Ara mateix no hi ha cap votació oberta.')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Veure les propostes' })).toHaveAttribute('href', '/propostes/');
      expect(screen.queryByRole('button', { name: /rànquing/i })).not.toBeInTheDocument();
    });

    it('amb la tanda tancada ofereix el rànquing de la darrera tanda i el mostra', async () => {
      mockFirestore({ tandes: [{ ...tandaOberta, tanca: PASSAT }] });
      carregarEstat.mockResolvedValue(estatTancat());
      carregarRanking.mockResolvedValue({
        tancada: true,
        files: [{ propostaId: 'p2', percentatge: 80 }, { propostaId: 'p1', percentatge: 40 }],
      });
      render(<IllaVotar />);
      expect(await screen.findByText('Ara mateix no hi ha cap votació oberta.')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Veure les propostes' })).toHaveAttribute('href', '/propostes/');
      await userEvent.click(screen.getByRole('button', { name: 'Veure el rànquing de la darrera tanda de pel·lícules' }));
      expect(await screen.findByRole('heading', { name: 'Rànquing de la darrera tanda de pel·lícules' })).toBeInTheDocument();
      expect(carregarRanking).toHaveBeenCalledWith('tok-7', 't1');
      expect(screen.getByText('El padrí')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Tancar el rànquing' }));
      expect(screen.getByRole('button', { name: 'Veure el rànquing de la darrera tanda de pel·lícules' })).toBeInTheDocument();
    });

    it('si falla l\'estat mostra l\'error amb «Tornar a provar» i «Sortir», i no diu que no hi ha votació', async () => {
      mockFirestore({ tandes: [tandaOberta] });
      carregarEstat.mockRejectedValueOnce(errorCallable('unavailable'));
      render(<IllaVotar />);
      expect(await screen.findByText(/No s'han pogut carregar les propostes/)).toBeInTheDocument();
      expect(screen.queryByText('Ara mateix no hi ha cap votació oberta.')).not.toBeInTheDocument();
      expect(screen.getAllByText(/Torna-ho a provar/)).toHaveLength(1);
      await userEvent.click(screen.getByRole('button', { name: 'Tornar a provar' }));
      expect(await screen.findByRole('progressbar')).toBeInTheDocument();
    });

    it('«Sortir» de l\'error de càrrega esborra la identitat i torna a l\'entrada', async () => {
      mockFirestore({ tandes: [tandaOberta] });
      carregarEstat.mockRejectedValue(errorCallable('unavailable'));
      render(<IllaVotar />);
      await userEvent.click(await screen.findByRole('button', { name: 'Sortir' }));
      expect(await screen.findByRole('button', { name: 'Simular escaneig' })).toBeInTheDocument();
      expect(sessionStorage.getItem('cineclub.identitat')).toBeNull();
    });

    it('«Sortir» del mode votació torna a l\'entrada amb escàner', async () => {
      mockFirestore({ tandes: [tandaOberta] });
      render(<IllaVotar />);
      await userEvent.click(await screen.findByRole('button', { name: /Sortir/ }));
      expect(await screen.findByRole('heading', { level: 1, name: 'Vota les propostes de Q4 2026' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Simular escaneig' })).toBeInTheDocument();
    });
  });
});
