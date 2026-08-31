import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,ABC') },
}));

import CarnetCard from './CarnetCard';

describe('CarnetCard', () => {
  it('mostra "Generant carnet…" fins que el QR es genera', () => {
    render(<CarnetCard soci={{ id: '1', numeroSoci: 7, nom: 'Anna', cognoms: 'Vidal', dataAlta: '2026-03-15' }} />);
    expect(screen.getByText('Generant carnet…')).toBeInTheDocument();
  });

  it('mostra el carnet amb el QR i les dades del soci quan es genera', async () => {
    render(<CarnetCard soci={{ id: '1', numeroSoci: 7, nom: 'Anna', cognoms: 'Vidal', dataAlta: '2026-03-15' }} />);
    const qr = await screen.findByAltText('Codi QR del carnet de Anna Vidal');
    expect(qr).toHaveAttribute('src', 'data:image/png;base64,ABC');
    expect(screen.getByText('Anna Vidal')).toBeInTheDocument();
    expect(screen.getByText('0007')).toBeInTheDocument();
    expect(screen.getByText('SOCI-7')).toBeInTheDocument();
  });

  it('omple amb zeros el número de soci fins a 4 xifres', async () => {
    render(<CarnetCard soci={{ id: '1', numeroSoci: 123, nom: 'Marc', cognoms: 'Serra' }} />);
    expect(await screen.findByText('0123')).toBeInTheDocument();
  });
});
