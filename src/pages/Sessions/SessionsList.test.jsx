import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../firebase/firebase', () => ({ db: {}, functions: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn(() => vi.fn().mockResolvedValue({ data: { crear: [], actualitzar: [], esborrar: [], placeholdersConservats: [], noGestionats: 0, sessionsOmeses: [] } })) }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  onSnapshot: vi.fn((q, callback) => {
    callback({
      docs: [
        { id: '1', data: () => ({ titol: 'The Artist', data: '2026-03-05', activa: false }) },
        { id: '2', data: () => ({ titol: 'Delicatessen', data: '2026-04-02', activa: true }) },
      ],
    });
    return () => {};
  }),
}));

import { getDocs, onSnapshot } from 'firebase/firestore';
import SessionsList from './SessionsList';
import { renderAmbConfirmacio } from '../../test/confirmacio';

describe('SessionsList', () => {
  it('mostra les sessions i marca quina és l\'activa', () => {
    renderAmbConfirmacio(<MemoryRouter><SessionsList /></MemoryRouter>);
    expect(screen.getByText(/The Artist/)).toBeInTheDocument();
    expect(screen.getByText(/Delicatessen/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Sessió activa' })).toBeInTheDocument();
  });

  it('l\'enllaç de cada sessió porta a la seva fitxa', () => {
    renderAmbConfirmacio(<MemoryRouter><SessionsList /></MemoryRouter>);
    expect(screen.getByRole('link', { name: /The Artist/ })).toHaveAttribute('href', '/sessions/1');
  });

  it('mostra el resum de socis, aportacions i rendibilitat de cada sessió', async () => {
    onSnapshot.mockImplementationOnce((q, callback) => {
      callback({ docs: [{ id: '1', data: () => ({ titol: 'The Artist', data: '2026-03-05', activa: false }) }] });
      return () => {};
    });
    getDocs
      .mockResolvedValueOnce({
        docs: [
          { data: () => ({ sessionId: '1', tipus: 'soci', numeroSoci: 7 }) },
          { data: () => ({ sessionId: '1', tipus: 'generic', codiTiquet: 'L1-001', preuAplicat: 5 }) },
        ],
      })
      .mockResolvedValueOnce({
        docs: [
          { data: () => ({ sessionId: '1', tipus: 'ingres', total: 100 }) },
          { data: () => ({ sessionId: '1', tipus: 'despesa', total: 40 }) },
        ],
      })
      .mockResolvedValueOnce({ docs: [] });
    renderAmbConfirmacio(<MemoryRouter><SessionsList /></MemoryRouter>);
    expect(await screen.findByText('Socis: 1')).toBeInTheDocument();
    expect(screen.getByText('No socis: 1')).toBeInTheDocument();
    expect(screen.getByText('Rendibilitat: 60.00€')).toBeInTheDocument();
  });

  it('en una sessió senseControl mostra una etiqueta en lloc de les estadístiques i no la compta a la rendibilitat', async () => {
    onSnapshot.mockImplementationOnce((q, callback) => {
      callback({
        docs: [
          { id: '1', data: () => ({ titol: 'The Artist', data: '2026-03-05', activa: false }) },
          { id: 'e1', data: () => ({ titol: 'Carretera a Gusen', data: '2026-03-20', activa: false, senseControl: true }) },
        ],
      });
      return () => {};
    });
    renderAmbConfirmacio(<MemoryRouter><SessionsList /></MemoryRouter>);
    expect(await screen.findByText('Carretera a Gusen')).toBeInTheDocument();
    expect(screen.getByText('Sessió especial · sense control')).toBeInTheDocument();
    expect(screen.getAllByText(/^Socis:/)).toHaveLength(1);
    expect(screen.getAllByText(/^Rendibilitat:/)).toHaveLength(1);
    expect(screen.getByRole('link', { name: /Carretera a Gusen/ })).toHaveAttribute('href', '/sessions/e1');
  });

  it('només senseControl === true amaga les estadístiques: "false", "true" (text) o 1 no compten', async () => {
    onSnapshot.mockImplementationOnce((q, callback) => {
      callback({
        docs: [
          { id: 'a', data: () => ({ titol: 'Text', data: '2026-03-05', activa: false, senseControl: 'true' }) },
          { id: 'b', data: () => ({ titol: 'Numero', data: '2026-03-06', activa: false, senseControl: 1 }) },
          { id: 'c', data: () => ({ titol: 'Fals', data: '2026-03-07', activa: false, senseControl: false }) },
        ],
      });
      return () => {};
    });
    renderAmbConfirmacio(<MemoryRouter><SessionsList /></MemoryRouter>);
    expect(await screen.findByText('Text')).toBeInTheDocument();
    expect(screen.queryByText('Sessió especial · sense control')).not.toBeInTheDocument();
    expect(screen.getAllByText(/^Socis:/)).toHaveLength(3);
  });

  describe('imatge de cada sessió', () => {
    const ambSessio = (dades) => onSnapshot.mockImplementationOnce((q, callback) => {
      callback({ docs: [{ id: '1', data: () => ({ titol: 'Pig', data: '2026-06-25', activa: false, ...dades }) }] });
      return () => {};
    });
    const imatge = (container) => container.querySelector('.sessions-list__imatge');

    it('fa servir publica.cartell encara que imatgeUrl estigui trencada o buida', () => {
      for (const imatgeUrl of ['https://cineclubrodadebera.cat/programacio/2026/pig/poster_hu123.jpg', '']) {
        ambSessio({ imatgeUrl, publica: { cartell: 'https://firebasestorage.googleapis.com/v0/b/b/o/web%2Fsessions%2Fpig%2Fposter.jpg?alt=media' } });
        const { container, unmount } = renderAmbConfirmacio(<MemoryRouter><SessionsList /></MemoryRouter>);
        expect(imatge(container)).toHaveAttribute('src', 'https://firebasestorage.googleapis.com/v0/b/b/o/web%2Fsessions%2Fpig%2Fposter.jpg?alt=media');
        unmount();
      }
    });

    it('sense publica fa servir imatgeUrl', () => {
      ambSessio({ imatgeUrl: 'https://cineclubrodadebera.cat/programacio/2026/pig/poster_hu123.jpg' });
      const { container } = renderAmbConfirmacio(<MemoryRouter><SessionsList /></MemoryRouter>);
      expect(imatge(container)).toHaveAttribute('src', 'https://cineclubrodadebera.cat/programacio/2026/pig/poster_hu123.jpg');
    });

    it('sense cap imatge no pinta cap <img>', () => {
      ambSessio({});
      const { container } = renderAmbConfirmacio(<MemoryRouter><SessionsList /></MemoryRouter>);
      expect(screen.getByText('Pig')).toBeInTheDocument();
      expect(imatge(container)).toBeNull();
    });
  });

  it('el botó «Sincronitzar el calendari» obre el panell', async () => {
    renderAmbConfirmacio(<MemoryRouter><SessionsList /></MemoryRouter>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sincronitzar el calendari' }));
    expect(screen.getByRole('dialog', { name: 'Sincronitzar el calendari' })).toBeInTheDocument();
    expect(await screen.findByText('Tot sincronitzat')).toBeInTheDocument();
  });

  it('el botó del calendari és d\'icona: aria-label, title, sense text visible i obre el panell', () => {
    renderAmbConfirmacio(<MemoryRouter><SessionsList /></MemoryRouter>);
    const boto = screen.getByRole('button', { name: 'Sincronitzar el calendari' });
    expect(boto).toHaveAttribute('aria-label', 'Sincronitzar el calendari');
    expect(boto).toHaveAttribute('title', 'Sincronitzar el calendari');
    expect(boto).toHaveClass('btn-icona');
    expect(boto).toHaveTextContent('');
    expect(boto.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    fireEvent.click(boto);
    expect(screen.getByRole('dialog', { name: 'Sincronitzar el calendari' })).toBeInTheDocument();
  });

  it('en tancar el panell el focus torna al botó del calendari', () => {
    renderAmbConfirmacio(<MemoryRouter><SessionsList /></MemoryRouter>);
    const boto = screen.getByRole('button', { name: 'Sincronitzar el calendari' });
    boto.focus();
    fireEvent.click(boto);
    fireEvent.click(screen.getByRole('button', { name: 'Tancar el diàleg' }));
    expect(boto).toHaveFocus();
  });
});

describe('SessionsList: layout estàndard', () => {
  it('fa servir l\'amplada de llista, un sol h1 i el botó «Nova sessió» amb text', () => {
    const { container } = renderAmbConfirmacio(<MemoryRouter><SessionsList /></MemoryRouter>);
    expect(container.firstChild).toHaveClass('pagina-admin', 'pagina-admin--llista');
    const titols = screen.getAllByRole('heading', { level: 1 });
    expect(titols).toHaveLength(1);
    expect(titols[0]).toHaveTextContent('Sessions');
    expect(screen.getByRole('link', { name: 'Nova sessió' })).toHaveTextContent('Nova sessió');
  });
});

describe('SessionsList: errors de càrrega', () => {
  it('si l\'oient de sessions falla, mostra l\'error i «Torna-ho a provar» es torna a subscriure', async () => {
    const errorConsola = vi.spyOn(console, 'error').mockImplementation(() => {});
    onSnapshot.mockImplementationOnce((q, _cb, onError) => { onError(new Error('permission-denied')); return () => {}; });
    renderAmbConfirmacio(<MemoryRouter><SessionsList /></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent("No s'han pogut carregar les sessions.");
    fireEvent.click(screen.getByRole('button', { name: 'Torna-ho a provar' }));
    expect(await screen.findByText(/The Artist/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    errorConsola.mockRestore();
  });

  it('si falla una lectura de les xifres (moviments), no mostra xifres falses: mostra l\'error', async () => {
    const errorConsola = vi.spyOn(console, 'error').mockImplementation(() => {});
    getDocs.mockResolvedValueOnce({ docs: [] }).mockRejectedValueOnce(new Error('unavailable'));
    renderAmbConfirmacio(<MemoryRouter><SessionsList /></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent("No s'han pogut carregar les sessions.");
    errorConsola.mockRestore();
  });
});
