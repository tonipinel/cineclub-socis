import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../firebase/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((db, nom) => nom),
  doc: vi.fn((db, nom, id) => `${nom}/${id}`),
  getDocs: vi.fn(),
  updateDoc: vi.fn(),
  deleteField: vi.fn(() => 'ESBORRA'),
}));
vi.mock('../../lib/social', async (importOriginal) => ({
  ...(await importOriginal()),
  exportaPng: vi.fn(),
  descarrega: vi.fn(),
  imatgeAData: vi.fn(),
  retallaMarges: vi.fn(),
}));

import { getDocs, updateDoc } from 'firebase/firestore';
import {
  descarrega, exportaPng, imatgeAData, retallaMarges,
} from '../../lib/social';
import SocialMedia from './SocialMedia';

const resposta = (llista) => ({ docs: llista.map(({ id, ...d }) => ({ id, data: () => d })) });
const sessio = (id, data, extra = {}) => ({
  id, titol: `Peli ${id}`, slug: `peli-${id}`, data, hora: '19:00', publicada: true, publica: { titol: `Peli ${id}`, cartell: `https://x/${id}.jpg` }, ...extra,
});

const SESSIONS = [
  sessio('antiga', '2020-01-01'),
  sessio('a', '2099-01-01', { publica: { titol: 'Peli a', cartell: 'https://x/a.jpg', cos: '## Sinopsi\n\nText llarg', curiositats: ['Una', 'Dues **grans**'], galeria: ['https://x/g1.jpg', 'https://x/g2.jpg', 'https://x/g3.jpg', 'https://x/g4.jpg'], suportDistribucioId: 'd1' } }),
  ...Array.from({ length: 11 }, (_, i) => sessio(`f${i}`, `2099-02-${String(i + 1).padStart(2, '0')}`)),
];

const DISTRIBUIDORES = [{ id: 'd1', nom: 'Filmoxarxa', logo: 'https://x/distribuidora.png' }];
const carrega = (sessions = SESSIONS, entitats = [], distribuidores = DISTRIBUIDORES) => {
  const dades = { sessions, entitats, distribuidores };
  getDocs.mockImplementation((nom) => Promise.resolve(resposta(dades[nom] ?? [])));
};

beforeEach(() => {
  vi.clearAllMocks();
  updateDoc.mockResolvedValue();
  retallaMarges.mockImplementation(async (dataUrl) => `${dataUrl}#retallat`);
  imatgeAData.mockImplementation(async (url) => `data:image/jpeg;base64,${btoa(url)}`);
  exportaPng.mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
});

async function obre() {
  carrega();
  render(<SocialMedia />);
  await screen.findByRole('heading', { name: 'Social media' });
}

// Obre la pàgina i passa a la pestanya Pel·lícula (amb la propera sessió ja triada).
async function obrePel() {
  await obre();
  await userEvent.setup().click(screen.getByRole('tab', { name: 'Pel·lícula' }));
}

describe('mode Pel·lícula', () => {
  it('ve amb la propera sessió ja triada, sense haver de buscar-la', async () => {
    const user = userEvent.setup();
    await obre();
    await user.click(screen.getByRole('tab', { name: 'Pel·lícula' }));
    expect(screen.getByRole('radio', { name: /Peli a$/ })).toBeChecked();
    expect(screen.getAllByRole('button', { name: 'Descarrega PNG' })).toHaveLength(4);
  });

  it('en triar una sessió mostra una diapositiva per curiositat, la portada i el tancament', async () => {
    const user = userEvent.setup();
    await obre();
    await user.click(screen.getByRole('tab', { name: 'Pel·lícula' }));
    await user.click(screen.getByRole('radio', { name: /Peli a$/ }));
    expect(screen.getAllByRole('button', { name: 'Descarrega PNG' })).toHaveLength(4);
    for (const etiqueta of ['Portada', 'Curiositat 1', 'Curiositat 2', 'Tancament']) {
      expect(screen.getByText(etiqueta)).toBeInTheDocument();
    }
  });

  it('mostra el text llarg renderitzat i «Copia» en posa el text pla al porta-retalls', async () => {
    const user = userEvent.setup();
    await obre();
    await user.click(screen.getByRole('tab', { name: 'Pel·lícula' }));
    await user.click(screen.getByRole('radio', { name: /Peli a$/ }));
    expect(await screen.findByRole('heading', { name: 'Sinopsi' })).toBeInTheDocument();
    expect(screen.getByText('Text llarg')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Text per al peu del post' })).not.toBeInTheDocument();
    const escriu = vi.spyOn(navigator.clipboard, 'writeText');
    await user.click(screen.getByRole('button', { name: 'Copia' }));
    expect(escriu).toHaveBeenCalledWith('Sinopsi\n\nText llarg');
    expect(await screen.findByRole('button', { name: 'Copiat' })).toBeInTheDocument();
  });

  it('avisa si no es pot copiar el text', async () => {
    const user = userEvent.setup();
    await obre();
    await user.click(screen.getByRole('tab', { name: 'Pel·lícula' }));
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denegat'));
    await user.click(screen.getByRole('button', { name: 'Copia' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("No s'ha pogut copiar el text.");
  });

  it('descarrega la diapositiva escollida amb el nom del fitxer', async () => {
    const user = userEvent.setup();
    await obre();
    await user.click(screen.getByRole('tab', { name: 'Pel·lícula' }));
    await user.click(screen.getByRole('radio', { name: /Peli a$/ }));
    const botons = screen.getAllByRole('button', { name: 'Descarrega PNG' });
    await user.click(botons[1]);
    await waitFor(() => expect(descarrega).toHaveBeenCalledTimes(1));
    expect(descarrega).toHaveBeenCalledWith(expect.any(Blob), 'cineclub-2099-01-01-peli-a-pelicula-2.png');
  });

  it('«Descarrega-ho tot» baixa totes les diapositives', async () => {
    const user = userEvent.setup();
    await obre();
    await user.click(screen.getByRole('tab', { name: 'Pel·lícula' }));
    await user.click(screen.getByRole('radio', { name: /Peli a$/ }));
    await user.click(screen.getByRole('button', { name: 'Descarrega-ho tot' }));
    await waitFor(() => expect(descarrega).toHaveBeenCalledTimes(4));
  });

  it('avisa si l\'exportació falla', async () => {
    const user = userEvent.setup();
    await obre();
    exportaPng.mockRejectedValue(new Error('x'));
    await user.click(screen.getByRole('tab', { name: 'Pel·lícula' }));
    await user.click(screen.getByRole('radio', { name: /Peli a$/ }));
    await user.click(screen.getAllByRole('button', { name: 'Descarrega PNG' })[0]);
    expect(await screen.findByRole('alert')).toHaveTextContent("No s'ha pogut generar la imatge");
    expect(descarrega).not.toHaveBeenCalled();
  });

  it('avisa que cal el CORS si les imatges no es poden baixar', async () => {
    const user = userEvent.setup();
    imatgeAData.mockRejectedValue(new TypeError('Failed to fetch'));
    await obre();
    await user.click(screen.getByRole('tab', { name: 'Pel·lícula' }));
    await user.click(screen.getByRole('radio', { name: /Peli a$/ }));
    await user.click(screen.getAllByRole('button', { name: 'Descarrega PNG' })[0]);
    expect(await screen.findByRole('alert')).toHaveTextContent(/imatges/);
    expect(exportaPng).not.toHaveBeenCalled();
  });
});

describe('curiositats', () => {
  const obrePelicula = async () => {
    const user = userEvent.setup();
    await obre();
    await user.click(screen.getByRole('tab', { name: 'Pel·lícula' }));
    return user;
  };

  it('mostra una caixa de text per curiositat, amb el seu valor', async () => {
    await obrePelicula();
    expect(screen.getByRole('textbox', { name: 'Curiositat 1' })).toHaveValue('Una');
    expect(screen.getByRole('textbox', { name: 'Curiositat 2' })).toHaveValue('Dues **grans**');
  });

  it('afegir una curiositat genera una diapositiva nova', async () => {
    const user = await obrePelicula();
    expect(screen.getAllByRole('button', { name: 'Descarrega PNG' })).toHaveLength(4);
    await user.click(screen.getByRole('button', { name: 'Afegeix curiositat' }));
    expect(screen.getByRole('textbox', { name: 'Curiositat 3' })).toHaveValue('');
    expect(screen.getAllByRole('button', { name: 'Descarrega PNG' })).toHaveLength(5);
  });

  it('la vista prèvia es refà mentre s\'escriu', async () => {
    const user = await obrePelicula();
    await user.type(screen.getByRole('textbox', { name: 'Curiositat 1' }), ' extra');
    expect([...document.querySelectorAll('.social-slide__text')].map((n) => n.textContent)).toContain('Una extra');
  });

  it('una curiositat buida encara no es pot descarregar', async () => {
    const user = await obrePelicula();
    await user.click(screen.getByRole('button', { name: 'Afegeix curiositat' }));
    const botons = screen.getAllByRole('button', { name: 'Descarrega PNG' });
    expect(botons[3]).toBeDisabled();
    expect(botons[1]).toBeEnabled();
  });

  it('el desat va a la barra inferior estàndard de l\'admin, només a Pel·lícula', async () => {
    const user = userEvent.setup();
    await obre();
    expect(document.querySelector('.barra-desar')).toBeNull();
    await user.click(screen.getByRole('tab', { name: 'Pel·lícula' }));
    expect(document.querySelector('.barra-desar')).not.toBeNull();
    expect(document.querySelector('.pagina-admin--amb-barra')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Desa les curiositats' })).not.toBeInTheDocument();
  });

  it('«Desar» només s\'activa amb canvis i la barra avisa que n\'hi ha', async () => {
    const user = userEvent.setup();
    await obrePelicula();
    expect(screen.getByRole('button', { name: 'Desar' })).toBeDisabled();
    expect(screen.getByText('Sense canvis')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Curiositat 1' }), '!');
    expect(screen.getByRole('button', { name: 'Desar' })).toBeEnabled();
    expect(screen.getByText('Hi ha canvis sense desar')).toBeInTheDocument();
  });

  it('desa la llista a la sessió, sense les buides, i la barra ho confirma', async () => {
    const user = userEvent.setup();
    await obrePelicula();
    await user.click(screen.getByRole('button', { name: 'Afegeix curiositat' }));
    await user.type(screen.getByRole('textbox', { name: 'Curiositat 3' }), ' Nova ');
    await user.click(screen.getByRole('button', { name: 'Afegeix curiositat' }));
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await waitFor(() => expect(updateDoc).toHaveBeenCalledWith('sessions/a', {
      curiositatsSocial: ['Una', 'Dues **grans**', 'Nova'], 'publica.curiositats': 'ESBORRA',
    }));
    expect(await screen.findByText('Desat ✓')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desar' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Curiositat 3' })).toHaveValue('Nova');
    expect(screen.queryByRole('textbox', { name: 'Curiositat 4' })).not.toBeInTheDocument();
  });

  it('«Descartar canvis» torna a les curiositats desades', async () => {
    const user = userEvent.setup();
    await obrePelicula();
    await user.type(screen.getByRole('textbox', { name: 'Curiositat 1' }), ' canviada');
    await user.click(screen.getByRole('button', { name: 'Afegeix curiositat' }));
    await user.click(screen.getByRole('button', { name: 'Descartar canvis' }));
    expect(screen.getByRole('textbox', { name: 'Curiositat 1' })).toHaveValue('Una');
    expect(screen.queryByRole('textbox', { name: 'Curiositat 3' })).not.toBeInTheDocument();
    expect(updateDoc).not.toHaveBeenCalled();
    expect(screen.getByText('Sense canvis')).toBeInTheDocument();
  });

  it('esborrar una curiositat treu la seva diapositiva', async () => {
    const user = await obrePelicula();
    await user.click(screen.getByRole('button', { name: 'Esborra la curiositat 1' }));
    expect(screen.getByRole('textbox', { name: 'Curiositat 1' })).toHaveValue('Dues **grans**');
    expect(screen.queryByRole('textbox', { name: 'Curiositat 2' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Descarrega PNG' })).toHaveLength(3);
  });

  it('avisa si no s\'ha pogut desar i manté els canvis', async () => {
    const user = await obrePelicula();
    updateDoc.mockRejectedValue(new Error('x'));
    await user.type(screen.getByRole('textbox', { name: 'Curiositat 1' }), '!');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("No s'han pogut desar les curiositats.");
    expect(screen.getByRole('button', { name: 'Desar' })).toBeEnabled();
  });

  it('avisa d\'una curiositat de més de 280 caràcters', async () => {
    await obrePelicula();
    fireEvent.change(screen.getByRole('textbox', { name: 'Curiositat 1' }), { target: { value: 'a'.repeat(281) } });
    expect(screen.getByText(/passa de 280 caràcters/)).toBeInTheDocument();
  });

  it('una sessió amb galeria i sense curiositats convida a afegir-ne', async () => {
    const user = userEvent.setup();
    carrega([...SESSIONS, sessio('g', '2099-03-01', { publica: { titol: 'Peli g', galeria: ['https://x/1.jpg', 'https://x/2.jpg'] } })]);
    render(<SocialMedia />);
    await screen.findByRole('heading', { name: 'Social media' });
    await user.click(screen.getByRole('tab', { name: 'Pel·lícula' }));
    await user.click(screen.getByRole('radio', { name: /Peli g$/ }));
    expect(screen.getByText(/Encara no hi ha curiositats/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Afegeix curiositat' })).toBeEnabled();
    expect(screen.getAllByRole('button', { name: 'Descarrega PNG' })).toHaveLength(2);
  });

  it('no deixa afegir més curiositats que imatges a la galeria i n\'explica el motiu', async () => {
    const user = await obrePelicula();
    expect(screen.queryByText(/no hi ha més imatges a la galeria/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Afegeix curiositat' }));
    await user.click(screen.getByRole('button', { name: 'Afegeix curiositat' }));
    expect(screen.getAllByRole('textbox', { name: /Curiositat/ })).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Afegeix curiositat' })).toBeDisabled();
    expect(screen.getByText('No es poden afegir més curiositats perquè no hi ha més imatges a la galeria.')).toBeInTheDocument();
  });

  it('una sessió sense galeria no pot tenir curiositats', async () => {
    const user = userEvent.setup();
    await obre();
    await user.click(screen.getByRole('tab', { name: 'Pel·lícula' }));
    await user.click(screen.getByRole('radio', { name: /Peli f0$/ }));
    expect(screen.getByRole('button', { name: 'Afegeix curiositat' })).toBeDisabled();
    expect(screen.getByText(/no hi ha més imatges a la galeria/)).toBeInTheDocument();
  });

  it('a Programació no hi ha editor de curiositats', async () => {
    await obre();
    expect(screen.queryByRole('button', { name: 'Afegeix curiositat' })).not.toBeInTheDocument();
  });
});

describe('Filmoxarxa a les curiositats', () => {
  it('si la distribuïdora és Filmoxarxa, les diapositives de curiositats porten el seu logo al costat del del Cineclub', async () => {
    const user = userEvent.setup();
    await obre();
    await user.click(screen.getByRole('tab', { name: 'Pel·lícula' }));
    const curiositats = document.querySelectorAll('.social-slide--curiositat');
    expect(curiositats).toHaveLength(2);
    curiositats.forEach((c) => expect(c.querySelector('.social-slide__logos-parella')).not.toBeNull());
    expect(document.querySelector('.social-slide--portada-pelicula .social-slide__logos-parella')).toBeNull();
    // i al tancament de la pel·lícula també
    expect(document.querySelector('.social-slide--tancament .social-slide__logos-parella')).not.toBeNull();
  });

  it('el tancament de Programació no porta el logo de Filmoxarxa, encara que la sessió sigui de Filmoxarxa', async () => {
    await obre();
    expect(document.querySelector('.social-slide--tancament')).not.toBeNull();
    expect(document.querySelectorAll('.social-slide__pastilla .social-slide__logo-filmoxarxa')).toHaveLength(0);
  });

  it('amb una altra distribuïdora, no', async () => {
    const user = userEvent.setup();
    carrega(SESSIONS, [], [{ id: 'd1', nom: 'Atalante', logo: 'https://x/distribuidora.png' }]);
    render(<SocialMedia />);
    await screen.findByRole('heading', { name: 'Social media' });
    await user.click(screen.getByRole('tab', { name: 'Pel·lícula' }));
    expect(document.querySelectorAll('.social-slide--curiositat .social-slide__logos-parella')).toHaveLength(0);
  });
});

describe('curiositats desades en un camp propi de la sessió', () => {
  it('llegeix el camp propi (amb preferència) i, si no hi és, el de la fitxa pública', async () => {
    const user = userEvent.setup();
    carrega([
      sessio('p', '2099-01-01', { curiositatsSocial: ['Del camp propi'], publica: { titol: 'Peli p', cartell: 'https://x/p.jpg', galeria: ['https://x/1.jpg', 'https://x/2.jpg'], curiositats: ['Del camp antic'] } }),
      sessio('q', '2099-01-02', { publica: { titol: 'Peli q', cartell: 'https://x/q.jpg', galeria: ['https://x/1.jpg', 'https://x/2.jpg'], curiositats: ['Del camp antic'] } }),
    ]);
    render(<SocialMedia />);
    await screen.findByRole('heading', { name: 'Social media' });
    await user.click(screen.getByRole('tab', { name: 'Pel·lícula' }));
    expect(screen.getByRole('textbox', { name: 'Curiositat 1' })).toHaveValue('Del camp propi');
    await user.click(screen.getByRole('radio', { name: /Peli q$/ }));
    expect(screen.getByRole('textbox', { name: 'Curiositat 1' })).toHaveValue('Del camp antic');
  });

  it('«Desat ✓» és de la sessió desada: en canviar de sessió la barra torna a «Sense canvis»', async () => {
    const user = userEvent.setup();
    await obrePel();
    await user.type(screen.getByRole('textbox', { name: 'Curiositat 1' }), '!');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await screen.findByText('Desat ✓')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /Peli f0$/ }));
    expect(screen.queryByText('Desat ✓')).not.toBeInTheDocument();
    expect(screen.getByText('Sense canvis')).toBeInTheDocument();
  });

  it('mentre es desa no es pot canviar de sessió ni de pestanya', async () => {
    const user = userEvent.setup();
    let acaba;
    updateDoc.mockImplementation(() => new Promise((resolve) => { acaba = resolve; }));
    await obrePel();
    await user.type(screen.getByRole('textbox', { name: 'Curiositat 1' }), '!');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Programació' })).toBeDisabled());
    expect(screen.getAllByRole('radio').every((r) => r.disabled)).toBe(true);
    acaba();
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Programació' })).toBeEnabled());
  });
});

describe('exportació i accessibilitat', () => {
  it('en exportar, la diapositiva ja porta les imatges convertides a data: (no es fia d\'un temporitzador)', async () => {
    const user = userEvent.setup();
    imatgeAData.mockImplementation((url) => new Promise((resolve) => { setTimeout(() => resolve(`data:image/jpeg;base64,${btoa(url)}`), 30); }));
    let srcs = [];
    exportaPng.mockImplementation(async (node) => {
      srcs = [...node.querySelectorAll('img')].map((i) => i.getAttribute('src'));
      return new Blob(['png'], { type: 'image/png' });
    });
    await obrePel();
    await user.click(screen.getAllByRole('button', { name: 'Descarrega PNG' })[0]);
    await waitFor(() => expect(exportaPng).toHaveBeenCalled());
    const remotes = srcs.filter((u) => /^https?:/.test(u));
    expect(srcs.length).toBeGreaterThan(0);
    expect(remotes).toEqual([]);
  });

  it('les vistes prèvies estan amagades als lectors de pantalla (el text ja és als quadres i etiquetes)', async () => {
    await obre();
    const previes = document.querySelectorAll('.social-previa');
    expect(previes.length).toBeGreaterThan(0);
    previes.forEach((p) => expect(p).toHaveAttribute('aria-hidden', 'true'));
  });

  it('una sessió amb la data malmesa (mes 13) no trenca la pàgina ni surt al llistat', async () => {
    carrega([...SESSIONS, sessio('mala', '2099-13-05', { titol: 'Data malmesa' })]);
    render(<SocialMedia />);
    expect(await screen.findByRole('heading', { name: 'Social media' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Data malmesa/ })).not.toBeInTheDocument();
  });
});

describe('robustesa', () => {
  it('no llista les sessions sense data (recent programades) al selector de Pel·lícula', async () => {
    const user = userEvent.setup();
    carrega([...SESSIONS, sessio('buida', '', { titol: 'Sense data' })]);
    render(<SocialMedia />);
    await screen.findByRole('heading', { name: 'Social media' });
    await user.click(screen.getByRole('tab', { name: 'Pel·lícula' }));
    expect(screen.queryByRole('radio', { name: /Sense data/ })).not.toBeInTheDocument();
  });

  it('una imatge que ha fallat es torna a provar en el proper intent', async () => {
    const user = userEvent.setup();
    imatgeAData.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockImplementation(async (url) => `data:image/jpeg;base64,${btoa(url)}`);
    carrega([sessio('a', '2099-01-01')]);
    render(<SocialMedia />);
    await screen.findByRole('heading', { name: 'Social media' });
    await user.click(screen.getAllByRole('button', { name: 'Descarrega PNG' })[0]);
    await waitFor(() => expect(descarrega).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('mentre s\'exporta no es pot canviar el tipus ni la selecció', async () => {
    const user = userEvent.setup();
    let acaba;
    exportaPng.mockImplementation(() => new Promise((resolve) => { acaba = () => resolve(new Blob(['png'], { type: 'image/png' })); }));
    await obre();
    await user.click(screen.getAllByRole('button', { name: 'Descarrega PNG' })[0]);
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Pel·lícula' })).toBeDisabled());
    expect(screen.getAllByRole('checkbox').every((c) => c.disabled)).toBe(true);
    acaba();
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Pel·lícula' })).toBeEnabled());
  });
});

describe('mode Programació', () => {
  it('per defecte marca les properes sessions (fins a 10) i no llista les passades', async () => {
    await obre();
    expect(screen.queryByRole('checkbox', { name: /Peli antiga/ })).not.toBeInTheDocument();
    const caselles = screen.getAllByRole('checkbox');
    expect(caselles.filter((c) => c.checked)).toHaveLength(10);
    // l'obertura, una portada per sessió i el tancament
    expect(screen.getAllByRole('button', { name: 'Descarrega PNG' })).toHaveLength(12);
    expect(screen.getByText('Obertura')).toBeInTheDocument();
  });

  it('no deixa passar de 10: les caselles sense marcar queden desactivades', async () => {
    const user = userEvent.setup();
    await obre();
    const sobrant = screen.getAllByRole('checkbox').find((c) => !c.checked);
    expect(sobrant).toBeDisabled();
    await user.click(screen.getAllByRole('checkbox').find((c) => c.checked));
    expect(sobrant).toBeEnabled();
  });

  it('descarrega una imatge per sessió amb el nom esperat', async () => {
    const user = userEvent.setup();
    await obre();
    await user.click(screen.getAllByRole('button', { name: 'Descarrega PNG' })[1]);
    await waitFor(() => expect(descarrega).toHaveBeenCalledWith(expect.any(Blob), 'cineclub-2099-01-01-peli-a-programacio-2.png'));
  });

  it('la primera imatge és l\'obertura amb el mosaic i es pot descarregar', async () => {
    const user = userEvent.setup();
    await obre();
    // només la sessió «a» té galeria: l'obertura en fa servir el 2n fotograma (el 1r és al collage del tancament)
    const principals = [...document.querySelectorAll('.social-slide--obertura .social-slide__tira-principal')];
    expect(principals).toHaveLength(1);
    // a l'URL o, si ja s'ha convertit per exportar-la, a la seva còpia en data:
    expect(['https://x/g2.jpg', `data:image/jpeg;base64,${btoa('https://x/g2.jpg')}`]).toContain(principals[0].getAttribute('src'));
    await user.click(screen.getAllByRole('button', { name: 'Descarrega PNG' })[0]);
    await waitFor(() => expect(descarrega).toHaveBeenCalledWith(expect.any(Blob), expect.stringMatching(/obertura/)));
  });

  it('baixa el logo de la distribuïdora per posar-lo a la portada', async () => {
    await obre();
    await waitFor(() => expect(imatgeAData).toHaveBeenCalledWith('https://x/distribuidora.png'));
  });

  it('retalla els marges dels logos (distribuïdora i entitats) però no el cartell', async () => {
    await obre();
    await waitFor(() => expect(retallaMarges).toHaveBeenCalledWith(expect.stringContaining(btoa('https://x/distribuidora.png'))));
    expect(retallaMarges).not.toHaveBeenCalledWith(expect.stringContaining(btoa('https://x/a.jpg')));
  });

  it('afegeix una última diapositiva de tancament que es pot descarregar', async () => {
    const user = userEvent.setup();
    await obre();
    expect(screen.getByText('Tancament')).toBeInTheDocument();
    const botons = screen.getAllByRole('button', { name: 'Descarrega PNG' });
    await user.click(botons[botons.length - 1]);
    await waitFor(() => expect(descarrega).toHaveBeenCalledWith(expect.any(Blob), expect.stringMatching(/tancament/)));
  });

  it('llista les entitats que col·laboren amb el seu logo', async () => {
    carrega(
      [sessio('c', '2099-03-01', { publica: { titol: 'Peli c', cartell: 'https://x/c.jpg', collabora: ['Ajuntament'] } })],
      [{ id: 'e1', nom: 'Ajuntament', logo: 'https://x/aj.png' }],
    );
    render(<SocialMedia />);
    await screen.findByRole('heading', { name: 'Social media' });
    await waitFor(() => expect(imatgeAData).toHaveBeenCalledWith('https://x/aj.png'));
    expect(within(document.body).getAllByRole('button', { name: 'Descarrega PNG' })).toHaveLength(3);
  });
});
