import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,ABC') },
}));

import CarnetQR from './CarnetQR';

describe('CarnetQR', () => {
  it('mostra el carnet amb el QR, les dades del soci i un enllaç de descàrrega quan es genera', async () => {
    render(<CarnetQR soci={{ id: '1', numeroSoci: 7, nom: 'Anna', cognoms: 'Vidal', dataAlta: '2026-03-15' }} />);
    const qr = await screen.findByAltText('Codi QR del carnet de Anna Vidal');
    expect(qr).toHaveAttribute('src', 'data:image/png;base64,ABC');
    expect(screen.getByText('Anna Vidal')).toBeInTheDocument();
    expect(screen.getByText('Núm. 7')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Imprimir carnet' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Descarregar només el QR' })).toHaveAttribute('download', 'carnet-qr-7.png');
  });
});
