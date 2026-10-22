// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TargetaVot from '../../src/components/propostes/TargetaVot.jsx';

const proposta = { id: 'p1', titol: 'Stalker', titolLocal: 'Stalker (ES)', imatgeUrl: 'https://img/p1.jpg' };
const completa = {
  ...proposta,
  any: '1979',
  durada: 162,
  paisos: ['URSS'],
  generes: ['Ciència-ficció', 'Drama'],
  sinopsi: 'Un guia porta dos homes a la Zona.',
  trailerUrl: 'https://www.youtube.com/watch?v=abc123',
  nomProposant: 'Isabel M.',
  comentari: 'Una obra mestra',
};

const botoLike = () => screen.getByRole('button', { name: "M'agrada" });
const botoDislike = () => screen.getByRole('button', { name: "No m'agrada" });

describe('TargetaVot', () => {
  it('mostra el títol, el títol local i el cartell', () => {
    render(<TargetaVot proposta={proposta} onVotar={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Stalker' })).toBeInTheDocument();
    expect(screen.getByText('(Stalker (ES))')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Stalker' })).toBeInTheDocument();
  });

  it('mostra la fitxa completa: tràiler, sinopsi, gèneres, resum, qui la proposa i la recomanació', () => {
    render(<TargetaVot proposta={completa} onVotar={() => {}} />);
    expect(screen.getByRole('button', { name: 'Veure el tràiler de Stalker' })).toBeInTheDocument();
    expect(screen.getByText('Un guia porta dos homes a la Zona.')).toBeInTheDocument();
    expect(screen.getByText('Ciència-ficció')).toBeInTheDocument();
    expect(screen.getByText('1979 · 162 min · URSS')).toBeInTheDocument();
    expect(screen.getByText(/Proposada per/)).toHaveTextContent('Proposada per Isabel M.');
    expect(screen.getByText('Una obra mestra')).toBeInTheDocument();
  });

  it('sense aquests camps es veu igualment (cartell de reserva, sense tràiler ni sinopsi)', () => {
    render(<TargetaVot proposta={{ id: 'p2', titol: 'Sense dades' }} onVotar={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Sense dades' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /tràiler/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Proposada per/)).not.toBeInTheDocument();
    expect(botoLike()).toBeInTheDocument();
    expect(botoDislike()).toBeInTheDocument();
  });

  it('el clic a 👍 crida onVotar(\'like\') i el de 👎 onVotar(\'dislike\')', async () => {
    const onVotar = vi.fn();
    render(<TargetaVot proposta={proposta} onVotar={onVotar} />);
    await userEvent.click(botoLike());
    expect(onVotar).toHaveBeenLastCalledWith('like');
    await userEvent.click(botoDislike());
    expect(onVotar).toHaveBeenLastCalledWith('dislike');
  });

  it('el botó actiu té aria-pressed=true i l\'altre false', () => {
    render(<TargetaVot proposta={proposta} valor="like" onVotar={() => {}} />);
    expect(botoLike()).toHaveAttribute('aria-pressed', 'true');
    expect(botoDislike()).toHaveAttribute('aria-pressed', 'false');
  });

  it('sense vot cap dels dos botons de vot està premut', () => {
    render(<TargetaVot proposta={proposta} onVotar={() => {}} />);
    expect(botoLike()).toHaveAttribute('aria-pressed', 'false');
    expect(botoDislike()).toHaveAttribute('aria-pressed', 'false');
  });

  it('amb bloquejat ambdós botons de vot són disabled', () => {
    render(<TargetaVot proposta={proposta} valor="like" bloquejat onVotar={() => {}} />);
    expect(botoLike()).toBeDisabled();
    expect(botoDislike()).toBeDisabled();
  });

  it('mostra discretament el vot que ja té la proposta', () => {
    const { rerender } = render(<TargetaVot proposta={proposta} onVotar={() => {}} />);
    expect(screen.getByText('Encara no has votat aquesta')).toBeInTheDocument();
    rerender(<TargetaVot proposta={proposta} valor="like" onVotar={() => {}} />);
    expect(screen.getByText("El teu vot: M'agrada")).toBeInTheDocument();
    rerender(<TargetaVot proposta={proposta} valor="dislike" onVotar={() => {}} />);
    expect(screen.getByText("El teu vot: No m'agrada")).toBeInTheDocument();
  });

  it('els botons de vot són dins de la barra de vot enganxada a baix', () => {
    render(<TargetaVot proposta={proposta} onVotar={() => {}} />);
    const barra = botoLike().closest('.targeta-vot__barra');
    expect(barra).not.toBeNull();
    expect(barra).toContainElement(botoDislike());
  });

  describe('focus i scroll en canviar de proposta', () => {
    let scrollIntoView;
    beforeEach(() => {
      scrollIntoView = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoView;
    });
    afterEach(() => {
      delete Element.prototype.scrollIntoView;
    });

    it('si enfocar és cert, en muntar-se mou el focus al títol i fa scroll a dalt de la fitxa', () => {
      render(<TargetaVot proposta={proposta} onVotar={() => {}} enfocar />);
      expect(screen.getByRole('heading', { name: 'Stalker' })).toHaveFocus();
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView.mock.contexts[0]).toBe(document.querySelector('.targeta-vot'));
    });

    it('el focus al títol no mou l\'scroll pel seu compte (preventScroll) i l\'scroll es fa a la targeta', () => {
      const focus = vi.spyOn(HTMLElement.prototype, 'focus');
      try {
        render(<TargetaVot proposta={proposta} onVotar={() => {}} enfocar />);
        expect(focus).toHaveBeenCalledWith({ preventScroll: true });
        expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
      } finally {
        focus.mockRestore();
      }
    });

    it('sense enfocar (càrrega inicial) no toca ni el focus ni l\'scroll', () => {
      render(<TargetaVot proposta={proposta} onVotar={() => {}} />);
      expect(screen.getByRole('heading', { name: 'Stalker' })).not.toHaveFocus();
      expect(scrollIntoView).not.toHaveBeenCalled();
    });

    it('en canviar la proposta, el focus passa al títol de la nova (no es queda en un botó)', async () => {
      const { rerender } = render(<TargetaVot proposta={proposta} onVotar={() => {}} enfocar />);
      await userEvent.click(botoLike());
      expect(botoLike()).toHaveFocus();
      scrollIntoView.mockClear();
      rerender(<TargetaVot proposta={{ id: 'p2', titol: 'Solaris' }} onVotar={() => {}} enfocar />);
      expect(screen.getByRole('heading', { name: 'Solaris' })).toHaveFocus();
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
    });

    it('canviar-ne només el vot (mateixa proposta) no mou el focus', async () => {
      const { rerender } = render(<TargetaVot proposta={proposta} onVotar={() => {}} enfocar />);
      await userEvent.click(botoLike());
      scrollIntoView.mockClear();
      rerender(<TargetaVot proposta={proposta} valor="like" onVotar={() => {}} enfocar />);
      expect(botoLike()).toHaveFocus();
      expect(scrollIntoView).not.toHaveBeenCalled();
    });
  });
});
