import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../firebase/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  getDocs: vi.fn(),
}));

import { getDocs } from 'firebase/firestore';
import EntitatsList from './EntitatsList';

const ENTITATS = [
  { id: 'e2', nom: 'Ateneu Rodenc', url: 'https://ateneu.test/', logo: 'https://logos.test/ateneu.png' },
  { id: 'e1', nom: 'Àgora', url: 'https://agora.test/' },
  { id: 'e3', nom: 'Zenit' },
];

const resposta = (llista) => ({ docs: llista.map(({ id, ...d }) => ({ id, data: () => d })) });

describe('EntitatsList', () => {
  it('llista les entitats ordenades pel nom amb enllaç a l\'edició', async () => {
    getDocs.mockResolvedValueOnce(resposta(ENTITATS));
    render(<MemoryRouter><EntitatsList /></MemoryRouter>);
    const noms = await screen.findAllByRole('link', { name: /^(Àgora|Ateneu Rodenc|Zenit)$/ });
    expect(noms.map((a) => a.textContent)).toEqual(['Àgora', 'Ateneu Rodenc', 'Zenit']);
    expect(noms[1]).toHaveAttribute('href', '/entitats/e2');
  });

  it('mostra la miniatura del logo amb el nom com a alt, i res si no n\'hi ha', async () => {
    getDocs.mockResolvedValueOnce(resposta(ENTITATS));
    render(<MemoryRouter><EntitatsList /></MemoryRouter>);
    const logo = await screen.findByRole('img', { name: 'Ateneu Rodenc' });
    expect(logo).toHaveAttribute('src', 'https://logos.test/ateneu.png');
    expect(screen.getAllByRole('img')).toHaveLength(1);
  });

  it('mostra la URL com a enllaç extern', async () => {
    getDocs.mockResolvedValueOnce(resposta(ENTITATS));
    render(<MemoryRouter><EntitatsList /></MemoryRouter>);
    const url = await screen.findByRole('link', { name: 'https://agora.test/' });
    expect(url).toHaveAttribute('href', 'https://agora.test/');
    expect(url).toHaveAttribute('target', '_blank');
    expect(url).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('buit: avisa i ofereix crear-ne una', async () => {
    getDocs.mockResolvedValueOnce(resposta([]));
    render(<MemoryRouter><EntitatsList /></MemoryRouter>);
    expect(await screen.findByText('Encara no hi ha cap entitat.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Nova entitat' })).toHaveAttribute('href', '/entitats/nova');
  });

  it('si la càrrega falla, mostra un avís i no el carregador', async () => {
    getDocs.mockRejectedValueOnce(new Error('permission-denied'));
    render(<MemoryRouter><EntitatsList /></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent("No s'han pogut carregar les entitats. Torna-ho a provar.");
    expect(screen.queryByText(/Carregant/)).not.toBeInTheDocument();
  });

  it('un document sense nom no trenca el llistat', async () => {
    getDocs.mockResolvedValueOnce(resposta([{ id: 'x', url: 'https://x.test/' }, ...ENTITATS]));
    render(<MemoryRouter><EntitatsList /></MemoryRouter>);
    expect(await screen.findByRole('link', { name: 'Zenit' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'https://x.test/' })).toBeInTheDocument();
  });
});

describe('EntitatsList: layout estàndard', () => {
  it('fa servir l\'amplada de llista, un sol h1 i el botó «Nova entitat» amb text', async () => {
    getDocs.mockResolvedValueOnce(resposta(ENTITATS));
    const { container } = render(<MemoryRouter><EntitatsList /></MemoryRouter>);
    const boto = await screen.findByRole('link', { name: 'Nova entitat' });
    expect(container.firstChild).toHaveClass('pagina-admin', 'pagina-admin--llista');
    const titols = screen.getAllByRole('heading', { level: 1 });
    expect(titols).toHaveLength(1);
    expect(titols[0]).toHaveTextContent('Entitats');
    expect(boto).toHaveTextContent('Nova entitat');
  });
});
