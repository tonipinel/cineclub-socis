import { describe, it, expect } from 'vitest';
import { useEffect, useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { publicaAFormulari } from '../../../lib/sessioPublica';
import ContingutsSessio from './ContingutsSessio';

const canvis = {};

function Arnes({ publica, errors = {} }) {
  const [form, setForm] = useState(publicaAFormulari(publica));
  useEffect(() => {
    canvis.form = form;
  }, [form]);
  return (
    <ContingutsSessio
      dades={{ id: '1', titol: 'Pig', data: '2026-10-08', slug: 'pig' }}
      onCanviDades={() => {}}
      form={form}
      onCanviForm={(camp, valor) => setForm((f) => ({ ...f, [camp]: valor }))}
      errors={errors}
      altresSessions={[]}
      original={{}}
    />
  );
}

describe('ContingutsSessio', () => {
  it('mostra els camps de text editorial', () => {
    render(<Arnes />);
    for (const etiqueta of ['Descripció (SEO)', 'Ganxo', 'Sinopsi del cartell', 'Textos editorials (Markdown)']) {
      expect(screen.getByLabelText(etiqueta)).toBeInTheDocument();
    }
    expect(screen.getByLabelText('Textos editorials (Markdown)')).toHaveAttribute('rows', '16');
  });

  it('compta els caràcters de la descripció i avisa si passa de 160', async () => {
    const user = userEvent.setup();
    render(<Arnes publica={{ descripcio: 'Hola' }} />);
    expect(screen.getByText('4/160 caràcters')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Descripció (SEO)'), 'a'.repeat(160));
    expect(screen.getByText('164/160 caràcters')).toBeInTheDocument();
    expect(screen.getByText('La descripció passa de 160 caràcters: els cercadors la retallaran.')).toBeInTheDocument();
  });

  it('mostra l\'error de la descripció en lloc de l\'avís', () => {
    render(<Arnes publica={{ descripcio: 'a'.repeat(200) }} errors={{ descripcio: 'La descripció no pot passar de 160 caràcters.' }} />);
    expect(screen.getByText('La descripció no pot passar de 160 caràcters.')).toBeInTheDocument();
    expect(screen.queryByText(/els cercadors la retallaran/)).not.toBeInTheDocument();
  });

  it('insereix l\'esquelet dels textos editorials si el camp és buit', async () => {
    const user = userEvent.setup();
    render(<Arnes />);
    await user.click(screen.getByRole('button', { name: "Inserir l'esquelet" }));
    expect(canvis.form.cos).toBe('## Sinopsi\n\n\n\n## Context\n\n\n\n## Curiositats\n\n\n\n## Per què l\'hem programat?\n\n');
    expect(screen.queryByRole('button', { name: "Inserir l'esquelet" })).not.toBeInTheDocument();
  });

  it('sense cos, la vista prèvia diu «Sense contingut.»', () => {
    render(<Arnes />);
    const previa = screen.getByRole('region', { name: 'Vista prèvia' });
    expect(within(previa).getByText('Sense contingut.')).toBeInTheDocument();
  });

  it('la vista prèvia renderitza el Markdown i en treu el codi perillós', async () => {
    const cos = '## Context\n\nText **important**.\n\n<img src=x onerror=alert(1)>\n\n<script>alert(2)</script>';
    const { container } = render(<Arnes publica={{ cos }} />);
    const previa = within(screen.getByRole('region', { name: 'Vista prèvia' }));
    expect(await previa.findByRole('heading', { level: 2, name: 'Context' })).toBeInTheDocument();
    expect(previa.getByText('important').tagName).toBe('STRONG');
    const seccio = screen.getByRole('region', { name: 'Vista prèvia' });
    expect(seccio.querySelector('img')).not.toBeNull();
    expect(container.querySelector('[onerror]')).toBeNull();
    expect(seccio.querySelector('script')).toBeNull();
  });

  it('la vista prèvia s\'actualitza en escriure', async () => {
    const user = userEvent.setup();
    render(<Arnes />);
    await user.type(screen.getByLabelText('Textos editorials (Markdown)'), '## Curiositats');
    const previa = within(screen.getByRole('region', { name: 'Vista prèvia' }));
    expect(await previa.findByRole('heading', { level: 2, name: 'Curiositats' })).toBeInTheDocument();
  });
});
