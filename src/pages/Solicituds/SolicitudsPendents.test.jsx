import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../firebase/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  doc: vi.fn((_db, _col, id) => id),
  addDoc: vi.fn().mockResolvedValue({ id: 'soci-nou' }),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  onSnapshot: (q, callback) => {
    callback({
      docs: [{ id: 'sol-1', data: () => ({ nom: 'Anna', cognoms: 'Vidal', telefon: '600000000', estat: 'pendent' }) }],
    });
    return () => {};
  },
}));

import { addDoc, updateDoc } from 'firebase/firestore';
import SolicitudsPendents from './SolicitudsPendents';

describe('SolicitudsPendents', () => {
  beforeEach(() => { addDoc.mockClear(); updateDoc.mockClear(); });

  it('aprova una sol·licitud: crea el soci i marca la sol·licitud com a aprovada', async () => {
    const user = userEvent.setup();
    render(<SolicitudsPendents />);
    await user.click(screen.getByRole('button', { name: 'Aprovar' }));
    expect(addDoc).toHaveBeenCalledTimes(1);
    expect(addDoc.mock.calls[0][1].nom).toBe('Anna');
    expect(updateDoc).toHaveBeenCalledWith('sol-1', { estat: 'aprovada' });
  });

  it('descarta una sol·licitud sense crear cap soci', async () => {
    const user = userEvent.setup();
    render(<SolicitudsPendents />);
    await user.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(addDoc).not.toHaveBeenCalled();
    expect(updateDoc).toHaveBeenCalledWith('sol-1', { estat: 'descartada' });
  });
});
