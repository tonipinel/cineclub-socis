import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../../firebase/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn().mockResolvedValue({ id: 'nou' }),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  getDoc: vi.fn(),
  collection: vi.fn(),
  doc: vi.fn(),
}));

import { addDoc } from 'firebase/firestore';
import SociForm from './SociForm';

describe('SociForm — alta', () => {
  beforeEach(() => addDoc.mockClear());

  it('crea un soci nou amb dataAlta i ultimPagament iguals', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/socis/nou']}>
        <Routes>
          <Route path="/socis/nou" element={<SociForm />} />
          <Route path="/socis" element={<p>Llistat de socis</p>} />
        </Routes>
      </MemoryRouter>
    );
    await user.type(screen.getByLabelText('Nom'), 'Anna');
    await user.type(screen.getByLabelText('Cognoms'), 'Vidal');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await screen.findByText('Llistat de socis')).toBeInTheDocument();
    const [, dadesDesades] = addDoc.mock.calls[0];
    expect(dadesDesades.nom).toBe('Anna');
    expect(dadesDesades.dataAlta).toBe(dadesDesades.ultimPagament);
  });
});
