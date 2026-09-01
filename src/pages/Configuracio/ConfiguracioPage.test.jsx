import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../firebase/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn().mockResolvedValue(undefined),
}));

import { getDoc, setDoc } from 'firebase/firestore';
import ConfiguracioPage from './ConfiguracioPage';

describe('ConfiguracioPage', () => {
  it('mostra els valors per defecte si encara no hi ha cap configuració desada', async () => {
    getDoc.mockResolvedValueOnce({ exists: () => false });
    render(<ConfiguracioPage />);
    expect(await screen.findByDisplayValue('30')).toBeInTheDocument();
  });

  it('carrega i mostra en només lectura la configuració existent', async () => {
    getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ quotaAnual: 35, numeroCompte: 'ES06 0182 8668 5602 0028 8844' }),
    });
    render(<ConfiguracioPage />);
    const camp = await screen.findByLabelText('Quota anual (€)');
    expect(camp).toHaveValue(35);
    expect(camp).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Número de compte (IBAN)')).toHaveValue('ES06 0182 8668 5602 0028 8844');
  });

  it('permet editar i desar la configuració', async () => {
    getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ quotaAnual: 30, numeroCompte: 'ES00 0000 0000 0000 0000 0000' }),
    });
    const user = userEvent.setup();
    render(<ConfiguracioPage />);
    await user.click(await screen.findByRole('button', { name: 'Editar dades' }));
    const campQuota = screen.getByLabelText('Quota anual (€)');
    await user.clear(campQuota);
    await user.type(campQuota, '40');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await screen.findByText('Desat correctament.')).toBeInTheDocument();
    const [, dadesDesades] = setDoc.mock.calls[0];
    expect(dadesDesades.quotaAnual).toBe(40);
    expect(dadesDesades.numeroCompte).toBe('ES00 0000 0000 0000 0000 0000');
  });
});
