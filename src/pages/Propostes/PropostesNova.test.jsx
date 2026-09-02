import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../../firebase/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn().mockResolvedValue({ id: 'nova' }),
  collection: vi.fn((_, nom) => nom),
  getDocs: vi.fn().mockResolvedValue({
    docs: [{ id: 's1', data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: 7 }) }],
  }),
  serverTimestamp: vi.fn(() => 'TIMESTAMP'),
}));

import { addDoc } from 'firebase/firestore';
import PropostesNova from './PropostesNova';

function renderPagina() {
  return render(
    <MemoryRouter initialEntries={['/propostes/pendents/nova']}>
      <Routes>
        <Route path="/propostes/pendents/nova" element={<PropostesNova />} />
        <Route path="/propostes/pendents" element={<p>Llistat de propostes</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('PropostesNova', () => {
  beforeEach(() => addDoc.mockClear());

  it('crea una proposta pendent en nom del soci trobat pel nom', async () => {
    const user = userEvent.setup();
    renderPagina();
    const campSoci = await screen.findByLabelText('Soci');
    await user.type(campSoci, 'Anna Vidal — núm. 7');
    await user.type(screen.getByLabelText('Títol'), 'L\'endemà');
    await user.click(screen.getByRole('button', { name: 'Crear proposta' }));

    expect(await screen.findByText('Llistat de propostes')).toBeInTheDocument();
    const [, dadesDesades] = addDoc.mock.calls[0];
    expect(dadesDesades).toEqual({
      titol: "L'endemà", enllac: '', comentari: '', numeroSoci: 7, nomProposant: 'Anna V.', estat: 'pendent', timestamp: 'TIMESTAMP',
    });
  });

  it('no desa si el text del soci no coincideix amb cap soci de la llista', async () => {
    const user = userEvent.setup();
    renderPagina();
    const campSoci = await screen.findByLabelText('Soci');
    await user.type(campSoci, 'Algú que no existeix');
    await user.type(screen.getByLabelText('Títol'), "L'endemà");
    await user.click(screen.getByRole('button', { name: 'Crear proposta' }));

    expect(await screen.findByText('Selecciona un soci vàlid de la llista.')).toBeInTheDocument();
    expect(addDoc).not.toHaveBeenCalled();
  });
});
