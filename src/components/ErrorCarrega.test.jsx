import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ErrorCarrega, { DocumentInexistent } from './ErrorCarrega';

describe('ErrorCarrega', () => {
  it('anuncia el missatge com a alerta i «Torna-ho a provar» crida onReintenta', async () => {
    const onReintenta = vi.fn();
    render(<ErrorCarrega missatge="No s'han pogut carregar les sessions." onReintenta={onReintenta} />);
    expect(screen.getByRole('alert')).toHaveTextContent("No s'han pogut carregar les sessions.");
    await userEvent.click(screen.getByRole('button', { name: 'Torna-ho a provar' }));
    expect(onReintenta).toHaveBeenCalledTimes(1);
  });

  it('sense onReintenta no mostra el botó', () => {
    render(<ErrorCarrega missatge="Error" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('amb títol, es mostra dins una pàgina d\'admin amb el seu h1', () => {
    render(<ErrorCarrega titol="Sessions" missatge="Error" onReintenta={() => {}} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sessions');
    expect(document.querySelector('.pagina-admin--llista')).toBeInTheDocument();
  });
});

describe('DocumentInexistent', () => {
  it('mostra el missatge i un enllaç per tornar al llistat', () => {
    render(
      <MemoryRouter>
        <DocumentInexistent titol="Sessió" missatge="Aquesta sessió no existeix." tornar={{ to: '/sessions', etiqueta: 'Sessions' }} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Aquesta sessió no existeix.');
    expect(screen.getByRole('link', { name: 'Torna a Sessions' })).toHaveAttribute('href', '/sessions');
  });
});
