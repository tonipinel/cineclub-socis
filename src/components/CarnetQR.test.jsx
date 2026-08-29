import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,ABC') },
}));

import CarnetQR from './CarnetQR';

describe('CarnetQR', () => {
  it('mostra la imatge del QR i un enllaç de descàrrega quan es genera', async () => {
    render(<CarnetQR soci={{ id: '1', numeroSoci: 7, nom: 'Anna', cognoms: 'Vidal' }} />);
    const imatge = await screen.findByAltText('Carnet QR de Anna Vidal');
    expect(imatge).toHaveAttribute('src', 'data:image/png;base64,ABC');
    expect(screen.getByRole('link', { name: 'Descarregar carnet' })).toHaveAttribute('download', 'carnet-7.png');
  });
});
