// Paritat entre les fitxes d'entitat i de distribuïdora: el mateix patró i la mateixa estructura accessible.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../firebase/firebase', () => ({ db: {}, storage: { app: { options: { storageBucket: 'bucket-prova' } } } }));
vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  doc: vi.fn((_db, col, id) => ({ col, id })),
  collection: vi.fn((_db, nom) => ({ nom })),
  query: vi.fn((col) => col),
  where: vi.fn(),
  serverTimestamp: vi.fn(),
}));
vi.mock('firebase/storage', () => ({ ref: vi.fn(), uploadBytes: vi.fn() }));

import { getDoc, getDocs } from 'firebase/firestore';
import EntitatForm from './Entitats/EntitatForm';
import DistribuidoraForm from './Distribuidores/DistribuidoraForm';
import { renderAmbConfirmacio } from '../test/confirmacio';

const LOGO = 'https://logos.test/a.png';

const FITXES = {
  entitat: { ruta: '/entitats/x1', patro: '/entitats/:id', Element: EntitatForm },
  distribuidora: { ruta: '/distribuidores/x1', patro: '/distribuidores/:id', Element: DistribuidoraForm },
};

async function renderFitxa(tipus, { logo = LOGO } = {}) {
  getDoc.mockResolvedValue({ data: () => ({ nom: 'Atalante', ...(logo ? { logo } : {}) }) });
  const { ruta, patro, Element } = FITXES[tipus];
  const resultat = renderAmbConfirmacio(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes><Route path={patro} element={<Element />} /></Routes>
    </MemoryRouter>,
  );
  await screen.findByLabelText('Nom');
  return resultat;
}

// Estructura accessible d'un element: rol/etiqueta, nom accessible i descendents, sense els textos propis de cada fitxa.
function estructuraLogo() {
  const grup = screen.getByRole('group', { name: 'Logo' });
  return {
    html: grup.outerHTML,
    descripcio: document.getElementById(grup.getAttribute('aria-describedby'))?.textContent,
    imatges: within(grup).queryAllByRole('img').length,
    previsualitzacio: grup.querySelector('img')?.getAttribute('alt'),
    selector: within(grup).getByLabelText(/el logo$/).getAttribute('accept'),
    botons: within(grup).queryAllByRole('button').map((b) => b.textContent),
  };
}

describe('paritat de les fitxes d\'entitat i de distribuïdora', () => {
  beforeEach(() => {
    getDocs.mockResolvedValue({ empty: true, docs: [] });
  });

  it.each([
    ['amb logo', LOGO],
    ['sense logo', ''],
  ])('el bloc del logo és idèntic a totes dues (%s)', async (_cas, logo) => {
    const { unmount } = await renderFitxa('entitat', { logo });
    const entitat = estructuraLogo();
    unmount();
    await renderFitxa('distribuidora', { logo });
    const distribuidora = estructuraLogo();
    expect(distribuidora).toEqual(entitat);
    expect(entitat.imatges).toBe(0);
    expect(entitat.descripcio).toBe('JPG, PNG o WebP, fins a 10 MB.');
    if (logo) {
      expect(entitat.previsualitzacio).toBe('');
      expect(entitat.botons).toEqual(['Treure el logo']);
    }
  });

  it('mateixa capçalera, ordre de seccions, enllaç públic, zona de perill i barra', async () => {
    const resum = () => {
      const form = document.querySelector('form');
      const etiquetes = [...form.querySelectorAll('.form__label')].map((l) => l.textContent);
      const zona = screen.getByRole('region', { name: 'Zona de perill' });
      const urlPublica = screen.getByLabelText('Pàgina web pública');
      return {
        noValidate: form.noValidate,
        classes: [...form.classList].filter((c) => c.startsWith('pagina-admin')),
        tornar: screen.getByRole('link', { name: /^←/ }).className,
        primera: etiquetes[0],
        // L'enllaç públic va just abans del logo, i el logo just després dels enllaços.
        abansDelLogo: etiquetes[etiquetes.indexOf('Logo') - 1],
        ajudaPublica: document.getElementById(urlPublica.getAttribute('aria-describedby')).textContent.split('.')[0],
        nomObligatori: screen.getByLabelText('Nom').getAttribute('aria-required'),
        botoZona: within(zona).getAllByRole('button').map((b) => [b.textContent, b.className]),
        zonaUltima: form.lastElementChild.previousElementSibling === zona,
        barra: Boolean(form.querySelector('.barra-desar')),
      };
    };
    const { unmount } = await renderFitxa('entitat');
    const entitat = resum();
    unmount();
    await renderFitxa('distribuidora');
    const distribuidora = resum();
    expect(distribuidora).toEqual(entitat);
    expect(entitat).toMatchObject({
      noValidate: true,
      primera: 'Nom',
      abansDelLogo: 'Pàgina web pública',
      ajudaPublica: 'Adreça on porta el logo al lloc públic',
      nomObligatori: 'true',
      botoZona: [['Eliminar', 'btn btn--perill']],
      zonaUltima: true,
      barra: true,
    });
  });
});
