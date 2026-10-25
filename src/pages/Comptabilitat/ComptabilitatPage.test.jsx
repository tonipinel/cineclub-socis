import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../../firebase/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  onSnapshot: vi.fn((q, callback) => {
    callback({
      docs: [
        {
          id: '1',
          data: () => ({
            data: '2026-03-01', concepte: 'Quotes de març', tipus: 'ingres',
            categoria: 'Quotes socis', metodePagament: 'efectiu', total: 100, sessionId: 's1',
            adjunt: { path: 'factures/abc/factura.pdf', nom: 'factura.pdf' },
          }),
        },
        {
          id: '2',
          data: () => ({
            data: '2026-04-01', concepte: 'Lloguer de sala', tipus: 'despesa',
            categoria: 'Gestió associació', metodePagament: 'banc', total: 40,
          }),
        },
        {
          id: '3',
          data: () => ({
            data: '2026-05-01', concepte: 'Traspàs a banc', tipus: 'traspas', total: 30,
          }),
        },
      ],
    });
    return () => {};
  }),
}));

vi.mock('../../lib/adjunts', () => ({ urlAdjunt: vi.fn().mockResolvedValue('https://storage.test/factura.pdf') }));

import { getDocs, onSnapshot } from 'firebase/firestore';
import ComptabilitatPage from './ComptabilitatPage';

describe('ComptabilitatPage', () => {
  it('calcula i mostra els saldos com a fórmula efectiu + bancària = tresoreria', () => {
    render(<MemoryRouter><ComptabilitatPage /></MemoryRouter>);
    expect(screen.getByText('Disponibilitat en efectiu')).toBeInTheDocument();
    expect(screen.getByText('100.00€')).toBeInTheDocument();
    expect(screen.getByText('Disponibilitat bancària')).toBeInTheDocument();
    expect(screen.getByText('-40.00€')).toBeInTheDocument();
    expect(screen.getByText('Fons total de tresoreria')).toBeInTheDocument();
    expect(screen.getByText('60.00€')).toBeInTheDocument();
  });

  it('llista els moviments', () => {
    render(<MemoryRouter><ComptabilitatPage /></MemoryRouter>);
    expect(screen.getByText('Quotes de març')).toBeInTheDocument();
    expect(screen.getByText('Lloguer de sala')).toBeInTheDocument();
  });

  it('el concepte és un enllaç real (obrible en pestanya nova), no només un clic de fila', () => {
    render(<MemoryRouter><ComptabilitatPage /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Quotes de març' })).toHaveAttribute('href', '/comptabilitat/1');
  });

  it('els moviments amb document mostren una icona que l\'obre en una finestra nova, sense anar al detall', async () => {
    const finestra = { location: {}, close: vi.fn() };
    const obrir = vi.spyOn(window, 'open').mockReturnValue(finestra);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<ComptabilitatPage />} />
          <Route path="/comptabilitat/:id" element={<p>Detall del moviment</p>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getAllByRole('button', { name: /Veure el document/ })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Veure el document factura.pdf' }));
    expect(obrir).toHaveBeenCalledWith('', '_blank');
    await vi.waitFor(() => expect(finestra.location.href).toBe('https://storage.test/factura.pdf'));
    expect(screen.queryByText('Detall del moviment')).not.toBeInTheDocument();
    obrir.mockRestore();
  });

  it('filtra per tipus', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><ComptabilitatPage /></MemoryRouter>);
    await user.selectOptions(screen.getByLabelText('Filtra per tipus'), 'despesa');
    expect(screen.queryByText('Quotes de març')).not.toBeInTheDocument();
    expect(screen.getByText('Lloguer de sala')).toBeInTheDocument();
  });

  it('en clicar una fila, navega a la seva edició', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/comptabilitat']}>
        <Routes>
          <Route path="/comptabilitat" element={<ComptabilitatPage />} />
          <Route path="/comptabilitat/:id" element={<p>Editar moviment</p>} />
        </Routes>
      </MemoryRouter>
    );
    await user.click(screen.getByText('Quotes de març'));
    expect(await screen.findByText('Editar moviment')).toBeInTheDocument();
  });

  it('mostra un enllaç per afegir un moviment nou', () => {
    render(<MemoryRouter><ComptabilitatPage /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Afegir moviment' })).toBeInTheDocument();
  });

  it('usa el layout de llista amb un únic h1 i el botó «Afegir moviment» amb text', () => {
    const { container } = render(<MemoryRouter><ComptabilitatPage /></MemoryRouter>);
    expect(container.firstChild).toHaveClass('pagina-admin', 'pagina-admin--llista');
    const titols = screen.getAllByRole('heading', { level: 1 });
    expect(titols).toHaveLength(1);
    expect(titols[0]).toHaveTextContent('Comptabilitat');
    const afegir = screen.getByRole('link', { name: 'Afegir moviment' });
    expect(afegir).toHaveAttribute('href', '/comptabilitat/nou');
    expect(afegir.querySelector('.btn-icona__text')).toHaveTextContent('Afegir moviment');
  });

  it('tots els filtres tenen nom accessible', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><ComptabilitatPage /></MemoryRouter>);
    expect(screen.getByLabelText('Filtra per tipus').tagName).toBe('SELECT');
    const categoria = screen.getByLabelText('Filtra per categoria');
    await user.selectOptions(categoria, 'Quotes socis');
    expect(categoria).toHaveValue('Quotes socis');
    expect(screen.getByLabelText('Filtra per sessió').tagName).toBe('SELECT');
    for (const camp of screen.getAllByRole('combobox')) expect(camp).toHaveAccessibleName();
  });

  it('no mostra cap badge de mètode buit a les files de traspàs', () => {
    render(<MemoryRouter><ComptabilitatPage /></MemoryRouter>);
    const fila = screen.getByText('Traspàs a banc').closest('tr');
    expect(within(fila).queryAllByRole('cell')[1].querySelector('.badge')).not.toBeInTheDocument();
  });

  it('filtra per sessió', async () => {
    getDocs.mockResolvedValueOnce({ docs: [{ id: 's1', data: () => ({ titol: 'The Artist', data: '2026-05-01' }) }] });
    const user = userEvent.setup();
    render(<MemoryRouter><ComptabilitatPage /></MemoryRouter>);
    await screen.findByRole('option', { name: 'The Artist' });
    await user.selectOptions(screen.getByLabelText('Filtra per sessió'), 's1');
    expect(screen.getByText('Quotes de març')).toBeInTheDocument();
    expect(screen.queryByText('Lloguer de sala')).not.toBeInTheDocument();
  });

  it('filtra per rang de dates (des de / fins)', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><ComptabilitatPage /></MemoryRouter>);
    await user.type(screen.getByLabelText('Data des de'), '2026-04-01');
    expect(screen.queryByText('Quotes de març')).not.toBeInTheDocument();
    expect(screen.getByText('Lloguer de sala')).toBeInTheDocument();
    expect(screen.getByText('Traspàs a banc')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Data fins'), '2026-04-01');
    expect(screen.getByText('Lloguer de sala')).toBeInTheDocument();
    expect(screen.queryByText('Traspàs a banc')).not.toBeInTheDocument();
  });

  it('el botó de filtres mostra i amaga el bloc de filtres', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><ComptabilitatPage /></MemoryRouter>);
    const botoFiltres = screen.getByRole('button', { name: 'Mostrar filtres' });
    expect(botoFiltres).toHaveAttribute('aria-expanded', 'false');
    await user.click(botoFiltres);
    expect(screen.getByRole('button', { name: 'Amagar filtres' })).toBe(botoFiltres);
    expect(botoFiltres).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('ComptabilitatPage — sessions especials sense control', () => {
  it('no ofereix les sessions senseControl al filtre per sessió', async () => {
    getDocs.mockResolvedValueOnce({
      docs: [
        { id: 's1', data: () => ({ titol: 'The Artist', data: '2026-05-01' }) },
        { id: 'e1', data: () => ({ titol: 'Carretera a Gusen', senseControl: true }) },
      ],
    });
    render(<MemoryRouter><ComptabilitatPage /></MemoryRouter>);
    await screen.findByRole('option', { name: 'The Artist' });
    expect(screen.queryByRole('option', { name: 'Carretera a Gusen' })).not.toBeInTheDocument();
  });

  it('no ofereix les sessions sense data (esborranys) al filtre per sessió', async () => {
    getDocs.mockResolvedValueOnce({
      docs: [
        { id: 's1', data: () => ({ titol: 'The Artist', data: '2026-05-01' }) },
        { id: 'd1', data: () => ({ titol: 'Esborrany sense data', data: '' }) },
      ],
    });
    render(<MemoryRouter><ComptabilitatPage /></MemoryRouter>);
    await screen.findByRole('option', { name: 'The Artist' });
    expect(screen.queryByRole('option', { name: 'Esborrany sense data' })).not.toBeInTheDocument();
  });
});

describe('ComptabilitatPage: error de càrrega', () => {
  it('si l\'oient de moviments falla, no mostra saldos de 0 € com si fossin reals: mostra l\'error i permet reintentar', async () => {
    const errorConsola = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(onSnapshot).mockImplementationOnce((q, _cb, onError) => { onError(new Error('permission-denied')); return () => {}; });
    render(<MemoryRouter><ComptabilitatPage /></MemoryRouter>);
    expect(screen.getByRole('alert')).toHaveTextContent("No s'han pogut carregar els moviments.");
    expect(screen.queryByText(/0,00/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Torna-ho a provar' }));
    expect(screen.getByText('Quotes de març')).toBeInTheDocument();
    errorConsola.mockRestore();
  });
});
