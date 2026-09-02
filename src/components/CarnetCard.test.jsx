import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,ABC') },
}));

import QRCode from 'qrcode';
import CarnetCard from './CarnetCard';

describe('CarnetCard', () => {
  it('mostra "Generant carnet…" fins que el QR es genera', () => {
    render(<CarnetCard soci={{ id: '1', numeroSoci: 7, nom: 'Anna', cognoms: 'Vidal', dataAlta: '2026-03-15', tokenCarnet: 'abc-123' }} />);
    expect(screen.getByText('Generant carnet…')).toBeInTheDocument();
  });

  it('mostra el carnet amb el QR generat a partir del token, i el codi manual a partir del numeroSoci', async () => {
    const soci = { id: '1', numeroSoci: 7, nom: 'Anna', cognoms: 'Vidal', dataAlta: '2026-03-15', tokenCarnet: 'abc-123' };
    render(<CarnetCard soci={soci} />);
    const qr = await screen.findByAltText('Codi QR del carnet de Anna Vidal');
    expect(qr).toHaveAttribute('src', 'data:image/png;base64,ABC');
    expect(QRCode.toDataURL).toHaveBeenCalledWith('CARNET-abc-123', { width: 400, margin: 0 });
    expect(screen.getByText('Anna Vidal')).toBeInTheDocument();
    expect(screen.getByText('0007')).toBeInTheDocument();
    expect(screen.getByText('SOCI-7')).toBeInTheDocument();
  });

  it('omple amb zeros el número de soci fins a 4 xifres', async () => {
    render(<CarnetCard soci={{ id: '1', numeroSoci: 123, nom: 'Marc', cognoms: 'Serra', tokenCarnet: 'def-456' }} />);
    expect(await screen.findByText('0123')).toBeInTheDocument();
  });

  it('mostra un avís i no genera el QR si el soci no té tokenCarnet', () => {
    QRCode.toDataURL.mockClear();
    const soci = { id: '1', numeroSoci: 7, nom: 'Anna', cognoms: 'Vidal', dataAlta: '2026-03-15' };
    render(<CarnetCard soci={soci} />);
    expect(screen.getByText('Aquest soci no té cap token de carnet assignat.')).toBeInTheDocument();
    expect(QRCode.toDataURL).not.toHaveBeenCalled();
  });
});
