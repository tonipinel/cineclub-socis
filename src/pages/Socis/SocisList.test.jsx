import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../../firebase/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  where: vi.fn((...args) => args),
  Timestamp: { fromDate: (d) => ({ data: d }) },
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  onSnapshot: vi.fn((q, callback) => {
    callback({
      docs: [
        { id: '1', data: () => ({ numeroSoci: 1, nom: 'Anna', cognoms: 'Vidal', ultimPagament: '2020-01-01' }) },
        { id: '2', data: () => ({ numeroSoci: 2, nom: 'Marc', cognoms: 'Serra', ultimPagament: '2099-01-01' }) },
      ],
    });
    return () => {};
  }),
}));

import { getDocs, onSnapshot, where } from 'firebase/firestore';
import SocisList from './SocisList';

describe('SocisList', () => {
  it('només llegeix les assistències dels últims 12 mesos', () => {
    render(<MemoryRouter><SocisList /></MemoryRouter>);
    const [camp, operador, valor] = where.mock.calls.at(-1);
    expect([camp, operador]).toEqual(['timestamp', '>=']);
    const mesos = (new Date() - valor.data) / (1000 * 60 * 60 * 24 * 30.4);
    expect(mesos).toBeGreaterThan(11.9);
    expect(mesos).toBeLessThan(12.1);
  });

  it('mostra els socis carregats amb el seu estat', () => {
    render(<MemoryRouter><SocisList /></MemoryRouter>);
    expect(screen.getByText('Anna')).toBeInTheDocument();
    expect(screen.getByText('Vençut')).toBeInTheDocument();
    expect(screen.getByText('Marc')).toBeInTheDocument();
    expect(screen.getByText('Al dia')).toBeInTheDocument();
  });

  it('filtra per text de cerca', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><SocisList /></MemoryRouter>);
    await user.type(screen.getByPlaceholderText(/cerca per nom/i), 'Marc');
    expect(screen.queryByText('Anna')).not.toBeInTheDocument();
    expect(screen.getByText('Marc')).toBeInTheDocument();
  });

  it('per defecte ordena per número de soci descendent', () => {
    render(<MemoryRouter><SocisList /></MemoryRouter>);
    const files = screen.getAllByRole('row').slice(1);
    expect(files[0]).toHaveTextContent('Marc');
    expect(files[1]).toHaveTextContent('Anna');
  });

  it('en clicar una capçalera, ordena per aquella columna', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><SocisList /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: /^Nom/ }));
    const files = screen.getAllByRole('row').slice(1);
    expect(files[0]).toHaveTextContent('Anna');
    expect(files[1]).toHaveTextContent('Marc');
  });

  it('el nom i els cognoms són enllaços reals (obribles en pestanya nova), no només un clic de fila', () => {
    render(<MemoryRouter><SocisList /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Anna' })).toHaveAttribute('href', '/socis/1');
    expect(screen.getByRole('link', { name: 'Vidal' })).toHaveAttribute('href', '/socis/1');
  });

  it('en clicar una fila, navega a la fitxa del soci', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/socis']}>
        <Routes>
          <Route path="/socis" element={<SocisList />} />
          <Route path="/socis/:id" element={<p>Fitxa del soci</p>} />
        </Routes>
      </MemoryRouter>
    );
    await user.click(screen.getByText('Anna'));
    expect(await screen.findByText('Fitxa del soci')).toBeInTheDocument();
  });

  it('en clicar la casella de selecció d\'una fila, no navega a la fitxa del soci', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/socis']}>
        <Routes>
          <Route path="/socis" element={<SocisList />} />
          <Route path="/socis/:id" element={<p>Fitxa del soci</p>} />
        </Routes>
      </MemoryRouter>
    );
    await user.click(screen.getByRole('checkbox', { name: 'Seleccionar Anna Vidal' }));
    expect(screen.queryByText('Fitxa del soci')).not.toBeInTheDocument();
  });

  it('mostra el nombre d\'assistències dels últims 12 mesos per soci', async () => {
    const ara = new Date();
    onSnapshot.mockImplementationOnce((q, callback) => {
      callback({
        docs: [
          { id: '1', data: () => ({ numeroSoci: 1, nom: 'Anna', cognoms: 'Vidal', ultimPagament: '2020-01-01' }) },
          { id: '2', data: () => ({ numeroSoci: 2, nom: 'Marc', cognoms: 'Serra', ultimPagament: '2099-01-01' }) },
        ],
      });
      return () => {};
    });
    getDocs.mockResolvedValueOnce({
      docs: [
        { data: () => ({ tipus: 'soci', numeroSoci: 1, sessionId: 's1', timestamp: { toDate: () => ara } }) },
        { data: () => ({ tipus: 'soci', numeroSoci: 1, sessionId: 's2', timestamp: { toDate: () => ara } }) },
      ],
    });
    render(<MemoryRouter><SocisList /></MemoryRouter>);
    const files = screen.getAllByRole('row').slice(1);
    const filaAnna = files.find((f) => f.textContent.includes('Anna'));
    const filaMarc = files.find((f) => f.textContent.includes('Marc'));
    const cellesAnna = within(filaAnna).getAllByRole('cell');
    const cellesMarc = within(filaMarc).getAllByRole('cell');
    expect(await within(filaAnna).findByText('2')).toBe(cellesAnna[cellesAnna.length - 1]);
    expect(cellesMarc[cellesMarc.length - 1]).toHaveTextContent('0');
  });

  it('permet seleccionar socis i mostra un enllaç per imprimir-ne els carnets', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><SocisList /></MemoryRouter>);
    expect(screen.queryByRole('link', { name: /Imprimir carnets/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Seleccionar Anna Vidal' }));
    const enllac = screen.getByRole('link', { name: 'Imprimir carnets (1)' });
    expect(enllac).toHaveAttribute('href', '/socis/carnets?ids=1');

    await user.click(screen.getByRole('checkbox', { name: 'Seleccionar Marc Serra' }));
    expect(screen.getByRole('link', { name: 'Imprimir carnets (2)' })).toHaveAttribute(
      'href', '/socis/carnets?ids=1,2'
    );
  });

  it('la casella "seleccionar tots" selecciona i deselecciona tots els socis visibles', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><SocisList /></MemoryRouter>);
    await user.click(screen.getByRole('checkbox', { name: 'Seleccionar tots els socis' }));
    expect(screen.getByRole('link', { name: 'Imprimir carnets (2)' })).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Seleccionar tots els socis' }));
    expect(screen.queryByRole('link', { name: /Imprimir carnets/ })).not.toBeInTheDocument();
  });

  it('mostra el badge "Desactivat" a més del d\'estat, per a un soci desactivat', () => {
    onSnapshot.mockImplementationOnce((q, callback) => {
      callback({
        docs: [
          { id: '1', data: () => ({ numeroSoci: 1, nom: 'Anna', cognoms: 'Vidal', ultimPagament: '2099-01-01', actiu: false }) },
        ],
      });
      return () => {};
    });
    render(<MemoryRouter><SocisList /></MemoryRouter>);
    expect(screen.getByText('Al dia')).toBeInTheDocument();
    expect(screen.getByText('Desactivat')).toBeInTheDocument();
  });

  it('el botó de filtres mostra i amaga el bloc de filtres', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><SocisList /></MemoryRouter>);
    const botoFiltres = screen.getByRole('button', { name: 'Mostrar filtres' });
    expect(botoFiltres).toHaveAttribute('aria-expanded', 'false');
    await user.click(botoFiltres);
    expect(screen.getByRole('button', { name: 'Amagar filtres' })).toBe(botoFiltres);
    expect(botoFiltres).toHaveAttribute('aria-expanded', 'true');
  });

  it('usa el layout de llista amb un únic h1 i el botó «Donar d\'alta» amb text', () => {
    const { container } = render(<MemoryRouter><SocisList /></MemoryRouter>);
    expect(container.firstChild).toHaveClass('pagina-admin', 'pagina-admin--llista');
    const titols = screen.getAllByRole('heading', { level: 1 });
    expect(titols).toHaveLength(1);
    expect(titols[0]).toHaveTextContent('Socis');
    const afegir = screen.getByRole('link', { name: "Donar d'alta" });
    expect(afegir).toHaveAttribute('href', '/socis/nou');
    expect(afegir.querySelector('.btn-icona__text')).toHaveTextContent("Donar d'alta");
  });

  it('el camp de cerca i el filtre d\'estat tenen nom accessible', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><SocisList /></MemoryRouter>);
    const cerca = screen.getByLabelText('Cerca un soci');
    expect(cerca.tagName).toBe('INPUT');
    const estat = screen.getByLabelText('Filtra per estat');
    expect(estat.tagName).toBe('SELECT');
    await user.selectOptions(estat, 'vencut');
    expect(estat).toHaveValue('vencut');
  });
});

describe('SocisList: errors de càrrega', () => {
  it('si l\'oient de socis falla, mostra l\'error i «Torna-ho a provar» es torna a subscriure', async () => {
    const errorConsola = vi.spyOn(console, 'error').mockImplementation(() => {});
    onSnapshot.mockImplementationOnce((q, _cb, onError) => { onError(new Error('permission-denied')); return () => {}; });
    render(<MemoryRouter><SocisList /></MemoryRouter>);
    expect(screen.getByRole('alert')).toHaveTextContent("No s'han pogut carregar els socis.");
    await userEvent.click(screen.getByRole('button', { name: 'Torna-ho a provar' }));
    expect(screen.getByText('Anna')).toBeInTheDocument();
    errorConsola.mockRestore();
  });

  it('si falla la lectura de les assistències, no mostra 0 assistències com si fos real', async () => {
    const errorConsola = vi.spyOn(console, 'error').mockImplementation(() => {});
    getDocs.mockRejectedValueOnce(new Error('unavailable'));
    render(<MemoryRouter><SocisList /></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent("No s'han pogut carregar els socis.");
    errorConsola.mockRestore();
  });
});
