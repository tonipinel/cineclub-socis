import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../constants/routes', async (original) => ({ ...(await original()), REDIRIGIR_PROPOSTES: true }));
vi.mock('../../firebase/firebase', () => ({ db: {} }));
vi.mock('./PropostesPublic', () => ({ default: () => <div>Pantalla pública incrustada</div> }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_, nom) => nom),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
}));

import PropostesPendents from './PropostesPendents';

describe('pestanya «Vista pública» amb REDIRIGIR_PROPOSTES a true', () => {
  it('enllaça a la web pública en una pestanya nova en lloc d\'incrustar-la', async () => {
    render(<MemoryRouter><PropostesPendents /></MemoryRouter>);
    await userEvent.click(screen.getByRole('tab', { name: 'Vista pública' }));
    const enllac = screen.getByRole('link', { name: /vista pública de les propostes/i });
    expect(enllac).toHaveAttribute('href', 'https://cineclubrodadebera.cat/propostes/');
    expect(enllac).toHaveAttribute('target', '_blank');
    expect(screen.queryByText('Pantalla pública incrustada')).not.toBeInTheDocument();
  });
});
