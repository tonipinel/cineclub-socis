import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../firebase/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn().mockResolvedValue({ id: 'abc' }),
  collection: vi.fn(),
  serverTimestamp: vi.fn(),
}));

import { addDoc } from 'firebase/firestore';
import AltaPublica from './AltaPublica';

describe('AltaPublica', () => {
  beforeEach(() => {
    addDoc.mockClear();
  });

  it('mostra errors de validació si s\'envia buit', async () => {
    const user = userEvent.setup();
    render(<AltaPublica />);
    await user.click(screen.getByRole('button', { name: /enviar sol·licitud/i }));
    expect(await screen.findByText('El nom és obligatori.')).toBeInTheDocument();
    expect(addDoc).not.toHaveBeenCalled();
  });

  it('crea la sol·licitud i mostra confirmació quan les dades són vàlides', async () => {
    const user = userEvent.setup();
    render(<AltaPublica />);
    await user.type(screen.getByLabelText(/^Nom/), 'Anna');
    await user.type(screen.getByLabelText(/Cognoms/), 'Vidal');
    await user.type(screen.getByLabelText(/Població/), 'Roda de Berà');
    await user.type(screen.getByLabelText(/Codi postal/), '43883');
    await user.type(screen.getByLabelText(/Telèfon/), '600000000');
    await user.click(screen.getByRole('checkbox', { name: /política de privacitat/i }));
    await user.click(screen.getByRole('checkbox', { name: /Autoritzo el tractament/i }));
    await user.click(screen.getByRole('button', { name: /enviar sol·licitud/i }));
    expect(await screen.findByText(/Hem rebut la teva sol·licitud/)).toBeInTheDocument();
    expect(addDoc).toHaveBeenCalledTimes(1);
  });
});
