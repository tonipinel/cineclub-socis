import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../../firebase/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, _col, id) => id),
  getDoc: vi.fn((id) => Promise.resolve({
    exists: () => true,
    id,
    data: () => ({
      '1': { nom: 'Anna', cognoms: 'Vidal', numeroSoci: 7, tokenCarnet: 'tok-1' },
      '2': { nom: 'Marc', cognoms: 'Serra', numeroSoci: 12, tokenCarnet: 'tok-2' },
    }[id]),
  })),
}));
vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,ABC') },
}));

import QRCode from 'qrcode';
import CarnetsLot from './CarnetsLot';

function renderAmb(ids) {
  return render(
    <MemoryRouter initialEntries={[`/socis/carnets?ids=${ids}`]}>
      <Routes><Route path="/socis/carnets" element={<CarnetsLot />} /></Routes>
    </MemoryRouter>
  );
}

describe('CarnetsLot', () => {
  it('carrega i mostra el carnet de cada soci seleccionat', async () => {
    renderAmb('1,2');
    expect(await screen.findByText('Anna Vidal')).toBeInTheDocument();
    expect(screen.getByText('Marc Serra')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Imprimir o desar com a PDF' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Tornar al llistat/ })).toHaveAttribute('href', '/socis');
    expect(QRCode.toDataURL).toHaveBeenCalledWith('CARNET-tok-1', { width: 400, margin: 0 });
  });

  it('completa la fila amb carnets buits perquè sempre en surtin grups de 3', async () => {
    const { container } = renderAmb('1,2');
    await screen.findByText('Anna Vidal');
    expect(container.querySelectorAll('.carnets-lot > .carnet')).toHaveLength(3);
  });

  it('no afegeix cap placeholder quan el nombre de socis ja és múltiple de 3', async () => {
    const { container } = renderAmb('1,2,1');
    await screen.findByText('Marc Serra');
    expect(container.querySelectorAll('.carnets-lot > .carnet')).toHaveLength(3);
  });

  it('mostra un missatge si no hi ha cap soci seleccionat', async () => {
    renderAmb('');
    expect(await screen.findByText('No s\'ha seleccionat cap soci.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Imprimir o desar com a PDF' })).not.toBeInTheDocument();
  });
});
