// Ajudants de proves per a les pàgines que demanen confirmació amb `useConfirmacio()`.
import { render, fireEvent, waitFor, within } from '@testing-library/react';
import { ConfirmacioProvider } from '../components/ConfirmacioProvider';
import { GRACIA_ACCEPTAR_MS } from '../components/DialegConfirmacio';

// Renderitza dins de `ConfirmacioProvider` (també en `rerender`).
export function renderAmbConfirmacio(ui, opcions = {}) {
  return render(ui, { wrapper: ConfirmacioProvider, ...opcions });
}

const trobaDialeg = () => document.querySelector('dialog.dialeg-confirmacio');

// El diàleg de confirmació obert (espera que aparegui).
export const dialegConfirmacio = () => waitFor(() => {
  const dialeg = trobaDialeg();
  if (!dialeg) throw new Error('No hi ha cap diàleg de confirmació obert');
  return dialeg;
});

export const hiHaDialegConfirmacio = () => trobaDialeg() !== null;

// Clica el botó d'acceptar com si haguessin passat els GRACIA_ACCEPTAR_MS des que s'ha obert.
// Date.now només s'avança durant el clic (síncron): el codi que continua després de la confirmació
// torna a veure el rellotge de la prova (real o simulat).
export async function acceptaDialeg(etiqueta) {
  const dialeg = await dialegConfirmacio();
  const boto = within(dialeg).getByRole('button', { name: etiqueta });
  const previ = Date.now;
  const moment = previ.call(Date) + GRACIA_ACCEPTAR_MS;
  Date.now = () => moment;
  try {
    fireEvent.click(boto);
  } finally {
    Date.now = previ;
  }
  return dialeg;
}

export async function cancellaDialeg(user) {
  const dialeg = await dialegConfirmacio();
  const boto = within(dialeg).getByRole('button', { name: 'Cancel·lar' });
  if (user) await user.click(boto);
  else fireEvent.click(boto);
  return dialeg;
}

// ESC amb el focus dins del diàleg (el focus inicial és a «Cancel·lar»).
export async function tancaDialegAmbEsc(user) {
  const dialeg = await dialegConfirmacio();
  if (user) await user.keyboard('{Escape}');
  else fireEvent.keyDown(document.activeElement, { key: 'Escape' });
  return dialeg;
}
