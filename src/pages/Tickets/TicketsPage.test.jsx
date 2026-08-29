import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,ABC') },
}));

import TicketsPage from './TicketsPage';

describe('TicketsPage', () => {
  it('genera els 150 codis del lot 1 per defecte', async () => {
    render(<TicketsPage />);
    expect(await screen.findByText('L1-001')).toBeInTheDocument();
    expect(screen.getByText('L1-150')).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(150);
  });

  it('en canviar al lot 2, mostra els codis L2', async () => {
    const user = userEvent.setup();
    render(<TicketsPage />);
    await screen.findByText('L1-001');
    await user.selectOptions(screen.getByRole('combobox'), 'lot2');
    expect(await screen.findByText('L2-001')).toBeInTheDocument();
    expect(screen.queryByText('L1-001')).not.toBeInTheDocument();
  });
});
