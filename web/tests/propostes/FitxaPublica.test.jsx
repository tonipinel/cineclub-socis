// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FitxaPublica from '../../src/components/propostes/FitxaPublica.jsx';

const PROPOSTA = {
  titol: 'La Haine',
  any: '1995',
  durada: 98,
  paisos: ['France'],
  generes: ['Drama', 'Crim'],
  lema: 'Fins ara tot va bé',
  sinopsi: 'Tres joves…',
  comentari: 'Una joia',
  nomProposant: 'Isabel M.',
  directors: ['Mathieu Kassovitz'],
  repartiment: [{ nom: 'Vincent Cassel', personatge: 'Vinz' }],
  trailerUrl: 'https://www.youtube.com/watch?v=abc123',
  valoracio: 8.1,
};

describe('FitxaPublica', () => {
  it('mostra el resum, els gèneres, el lema, la sinopsi i el tràiler', () => {
    render(<FitxaPublica proposta={PROPOSTA} />);
    expect(screen.getByRole('heading', { name: 'La Haine' })).toBeInTheDocument();
    expect(screen.getByText('1995 · 98 min · France')).toBeInTheDocument();
    expect(screen.getByText('Crim')).toBeInTheDocument();
    expect(screen.getByText('Fins ara tot va bé')).toBeInTheDocument();
    expect(screen.getByText('Tres joves…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Veure el tràiler de La Haine' })).toBeInTheDocument();
  });

  it('mostra per què la recomana el soci i qui ho fa', () => {
    render(<FitxaPublica proposta={PROPOSTA} />);
    expect(screen.getByText('Una joia')).toBeInTheDocument();
    expect(screen.getByText('— Isabel M.')).toBeInTheDocument();
  });

  it('mostra la direcció, el repartiment i la valoració', () => {
    render(<FitxaPublica proposta={PROPOSTA} />);
    expect(screen.getByText('Mathieu Kassovitz')).toBeInTheDocument();
    expect(screen.getByText('Vincent Cassel (Vinz)')).toBeInTheDocument();
    expect(screen.getByText('★ 8.1 / 10')).toBeInTheDocument();
  });

  it('una proposta antiga, sense dades de TMDB, es veu igualment', () => {
    render(<FitxaPublica proposta={{ titol: 'Amélie', sinopsi: 'Una noia parisenca' }} />);
    expect(screen.getByRole('heading', { name: 'Amélie' })).toBeInTheDocument();
    expect(screen.getByText('Una noia parisenca')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /tràiler/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Direcció')).not.toBeInTheDocument();
  });

  describe('galeria d\'imatges', () => {
    const AMB_IMATGES = { ...PROPOSTA, imatges: ['/a.jpg', '/b.jpg', '/c.jpg'] };

    it('mostra les imatges de la pel·lícula en miniatura', () => {
      render(<FitxaPublica proposta={AMB_IMATGES} />);
      const imatges = screen.getAllByRole('img', { name: 'Imatge de La Haine' });
      expect(imatges).toHaveLength(3);
      expect(imatges[0]).toHaveAttribute('src', 'https://image.tmdb.org/t/p/w500/a.jpg');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('en clicar una imatge, s\'obre en gran en un modal (no en una finestra nova)', async () => {
      const user = userEvent.setup();
      render(<FitxaPublica proposta={AMB_IMATGES} />);
      await user.click(screen.getAllByRole('button', { name: 'Ampliar la imatge' })[1]);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByRole('img', { name: 'Imatge ampliada de La Haine' })).toHaveAttribute(
        'src', 'https://image.tmdb.org/t/p/w1280/b.jpg'
      );
      expect(screen.queryByRole('link', { name: /Imatge/ })).not.toBeInTheDocument();
    });

    it('es tanca amb la creu, clicant fora de la imatge o amb Escape', async () => {
      const user = userEvent.setup();
      render(<FitxaPublica proposta={AMB_IMATGES} />);
      const obrir = () => user.click(screen.getAllByRole('button', { name: 'Ampliar la imatge' })[0]);

      await obrir();
      await user.click(screen.getByRole('button', { name: 'Tancar la imatge' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      await obrir();
      await user.click(screen.getByRole('dialog'));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      await obrir();
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('clicar la imatge ampliada no tanca el modal', async () => {
      const user = userEvent.setup();
      render(<FitxaPublica proposta={AMB_IMATGES} />);
      await user.click(screen.getAllByRole('button', { name: 'Ampliar la imatge' })[0]);
      await user.click(screen.getByRole('img', { name: 'Imatge ampliada de La Haine' }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('permet passar a la imatge següent i l\'anterior (cíclic), també amb el teclat', async () => {
      const user = userEvent.setup();
      render(<FitxaPublica proposta={AMB_IMATGES} />);
      await user.click(screen.getAllByRole('button', { name: 'Ampliar la imatge' })[0]);
      const ampliada = () => screen.getByRole('img', { name: 'Imatge ampliada de La Haine' });

      await user.click(screen.getByRole('button', { name: 'Imatge anterior' }));
      expect(ampliada()).toHaveAttribute('src', 'https://image.tmdb.org/t/p/w1280/c.jpg');
      await user.click(screen.getByRole('button', { name: 'Imatge següent' }));
      expect(ampliada()).toHaveAttribute('src', 'https://image.tmdb.org/t/p/w1280/a.jpg');
      await user.keyboard('{ArrowRight}');
      expect(ampliada()).toHaveAttribute('src', 'https://image.tmdb.org/t/p/w1280/b.jpg');
      await user.keyboard('{ArrowLeft}');
      expect(ampliada()).toHaveAttribute('src', 'https://image.tmdb.org/t/p/w1280/a.jpg');
    });

    it('amb una sola imatge, no mostra les fletxes', async () => {
      const user = userEvent.setup();
      render(<FitxaPublica proposta={{ ...PROPOSTA, imatges: ['/a.jpg'] }} />);
      await user.click(screen.getByRole('button', { name: 'Ampliar la imatge' }));
      expect(screen.queryByRole('button', { name: 'Imatge següent' })).not.toBeInTheDocument();
    });
  });

  it('sense imatges, no mostra cap galeria', () => {
    render(<FitxaPublica proposta={PROPOSTA} />);
    expect(screen.queryByRole('img', { name: 'Imatge de La Haine' })).not.toBeInTheDocument();
  });

  it('si el títol no és en castellà ni català, mostra a sota entre parèntesis el títol a Espanya', () => {
    render(<FitxaPublica proposta={{ ...PROPOSTA, titolLocal: 'El odio' }} />);
    expect(screen.getByText('(El odio)')).toBeInTheDocument();
  });

  it('sense títol local, no mostra cap parèntesi', () => {
    render(<FitxaPublica proposta={PROPOSTA} />);
    expect(screen.queryByText(/^\(/)).not.toBeInTheDocument();
  });

  describe('qui ha fet la proposta', () => {
    it('mostra sempre «Proposada per …» a la capçalera, també sense comentari', () => {
      const { container, rerender } = render(<FitxaPublica proposta={PROPOSTA} />);
      const linia = container.querySelector('.fitxa-publica__hero .fitxa-publica__proposant');
      expect(linia).toHaveTextContent('Proposada per Isabel M.');
      rerender(<FitxaPublica proposta={{ ...PROPOSTA, comentari: undefined }} />);
      expect(container.querySelector('.fitxa-publica__hero .fitxa-publica__proposant')).toHaveTextContent('Proposada per Isabel M.');
      expect(screen.queryByRole('blockquote')).not.toBeInTheDocument();
    });

    it('per a una proposta de l\'organització, mostra el nom de l\'associació', () => {
      render(<FitxaPublica proposta={{ ...PROPOSTA, nomProposant: 'Organització Cineclub Roda de Berà' }} />);
      expect(screen.getByText(/Proposada per/)).toHaveTextContent('Proposada per Organització Cineclub Roda de Berà');
    });

    it('sense nomProposant no mostra la línia', () => {
      render(<FitxaPublica proposta={{ ...PROPOSTA, nomProposant: undefined }} />);
      expect(screen.queryByText(/Proposada per/)).not.toBeInTheDocument();
    });

    it('amb senseProposant no mostra la línia (el detall ja ho diu a la seva capçalera)', () => {
      render(<FitxaPublica proposta={PROPOSTA} senseProposant />);
      expect(screen.queryByText(/Proposada per/)).not.toBeInTheDocument();
    });

    it('l\'atribució de la cita de la recomanació es manté', () => {
      render(<FitxaPublica proposta={PROPOSTA} />);
      expect(screen.getByText('— Isabel M.')).toBeInTheDocument();
    });
  });

  it('amb titolRef, el títol és enfocable per programa (tabIndex -1) i el ref hi apunta', () => {
    const titolRef = createRef();
    render(<FitxaPublica proposta={PROPOSTA} titolRef={titolRef} />);
    const titol = screen.getByRole('heading', { name: 'La Haine' });
    expect(titolRef.current).toBe(titol);
    expect(titol).toHaveAttribute('tabindex', '-1');
  });

  it('sense titolRef, el títol no té tabindex', () => {
    render(<FitxaPublica proposta={PROPOSTA} />);
    expect(screen.getByRole('heading', { name: 'La Haine' })).not.toHaveAttribute('tabindex');
  });
});
