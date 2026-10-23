import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ZonaPerill from './ZonaPerill';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ZonaPerill', () => {
  it('té el títol per defecte «Zona de perill» i els children dins la secció', () => {
    render(
      <ZonaPerill descripcio="Eliminar l'entitat no es pot desfer.">
        <button type="button">Eliminar</button>
      </ZonaPerill>,
    );
    const seccio = screen.getByRole('region', { name: 'Zona de perill' });
    expect(seccio.tagName).toBe('SECTION');
    expect(seccio.className).toBe('zona-perill');
    expect(seccio).toContainElement(screen.getByRole('button', { name: 'Eliminar' }));
    expect(seccio).toHaveTextContent("Eliminar l'entitat no es pot desfer.");
  });

  it('accepta un títol propi', () => {
    render(<ZonaPerill titol="Eliminar el soci"><button type="button">Eliminar</button></ZonaPerill>);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Eliminar el soci');
    expect(screen.getByRole('region', { name: 'Eliminar el soci' })).toBeInTheDocument();
  });
});
