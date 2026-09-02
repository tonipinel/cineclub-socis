import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../../firebase/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn().mockResolvedValue({
    data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: 7, dataAlta: '2026-03-15', tokenCarnet: 'tok-1' }),
  }),
}));
vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,ABC') },
}));

import QRCode from 'qrcode';
import CarnetSoci from './CarnetSoci';

describe('CarnetSoci', () => {
  it('carrega el soci i mostra el seu carnet', async () => {
    render(
      <MemoryRouter initialEntries={['/socis/1/carnet']}>
        <Routes><Route path="/socis/:id/carnet" element={<CarnetSoci />} /></Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText('Anna Vidal')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Tornar a la fitxa/ })).toHaveAttribute('href', '/socis/1');
    expect(QRCode.toDataURL).toHaveBeenCalledWith('CARNET-tok-1', { width: 400, margin: 0 });
  });
});
