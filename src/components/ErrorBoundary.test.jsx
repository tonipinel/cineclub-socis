import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ErrorBoundary from './ErrorBoundary';

let llenca;
function Fragil() {
  if (llenca) throw new Error('error de render');
  return <p>Contingut</p>;
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    llenca = true;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('mostra el contingut si no hi ha cap error', () => {
    llenca = false;
    render(<ErrorBoundary><Fragil /></ErrorBoundary>);
    expect(screen.getByText('Contingut')).toBeInTheDocument();
  });

  it('un error de render mostra el missatge amable i el registra a la consola', () => {
    render(<ErrorBoundary><Fragil /></ErrorBoundary>);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Alguna cosa ha anat malament');
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: "Torna a l'inici" })).toHaveAttribute('href', '/');
    expect(console.error).toHaveBeenCalledWith('Error de la interfície:', expect.any(Error), expect.anything());
  });

  it('«Torna-ho a provar» torna a renderitzar el contingut', async () => {
    render(<ErrorBoundary><Fragil /></ErrorBoundary>);
    llenca = false;
    await userEvent.click(screen.getByRole('button', { name: 'Torna-ho a provar' }));
    expect(screen.getByText('Contingut')).toBeInTheDocument();
  });

  it('es restableix quan canvia la clau de reinici (canvi de ruta)', () => {
    const { rerender } = render(<ErrorBoundary clauReinici="/a"><Fragil /></ErrorBoundary>);
    expect(screen.queryByText('Contingut')).not.toBeInTheDocument();
    llenca = false;
    rerender(<ErrorBoundary clauReinici="/b"><Fragil /></ErrorBoundary>);
    expect(screen.getByText('Contingut')).toBeInTheDocument();
  });
});
