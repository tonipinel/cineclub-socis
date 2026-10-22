// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TrailerPellicula from '../../src/components/propostes/TrailerPellicula.jsx';

describe('TrailerPellicula', () => {
  it('mostra una miniatura amb play i no carrega el vídeo fins que es clica', async () => {
    const user = userEvent.setup();
    const { container } = render(<TrailerPellicula url="https://www.youtube.com/watch?v=abc123" titol="La Haine" />);
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://img.youtube.com/vi/abc123/hqdefault.jpg');
    expect(container.querySelector('iframe')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Veure el tràiler de La Haine' }));

    expect(container.querySelector('iframe')).toHaveAttribute(
      'src', 'https://www.youtube-nocookie.com/embed/abc123?autoplay=1&rel=0'
    );
  });

  it.each([
    'https://youtu.be/abc123',
    'https://www.youtube.com/embed/abc123',
    'https://youtube.com/shorts/abc123',
  ])('reconeix l\'identificador d\'un enllaç de YouTube (%s)', (url) => {
    const { container } = render(<TrailerPellicula url={url} titol="X" />);
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://img.youtube.com/vi/abc123/hqdefault.jpg');
  });

  it('si l\'enllaç no és de YouTube, el mostra com a botó que s\'obre a una pestanya nova', () => {
    render(<TrailerPellicula url="https://vimeo.com/123" titol="X" />);
    expect(screen.getByRole('link', { name: 'Veure tràiler' })).toHaveAttribute('href', 'https://vimeo.com/123');
  });
});
