import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fireEvent, render, screen, waitFor, within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../../firebase/firebase', () => ({ db: {}, functions: {} }));
const mockCrida = vi.fn();
vi.mock('firebase/functions', () => ({
  httpsCallable: (_functions, nom) => (dades) => mockCrida(nom, dades),
}));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, nom) => ({ nom })),
  query: vi.fn((col, ...filtres) => ({ ...col, filtres })),
  where: vi.fn((camp, op, valor) => ({ camp, op, valor })),
  getDocs: vi.fn(),
}));
const mockUseAuth = vi.fn();
vi.mock('../../auth/useAuth', () => ({ useAuth: () => mockUseAuth() }));

import { getDocs, where } from 'firebase/firestore';
import { RequireAuth } from '../../auth/RequireAuth';
import { RequireRole } from '../../auth/RequireRole';
import UsuarisTaquillaList from './UsuarisTaquillaList';
import UsuariTaquillaNou from './UsuariTaquillaNou';
import UsuariTaquillaFitxa from './UsuariTaquillaFitxa';
import {
  acceptaDialeg, cancellaDialeg, renderAmbConfirmacio,
} from '../../test/confirmacio';

const ENLLAC = 'https://cineclub.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=SECRET';
const USUARIS = [
  { uid: 'u1', nom: 'Anna Puig', correu: 'anna@example.com', desactivat: false, ultimAcces: '2026-10-20T19:30:00.000Z', creat: '2026-08-01T10:00:00.000Z' },
  { uid: 'u2', nom: 'Pere Vidal', correu: 'pere@example.com', desactivat: true, ultimAcces: null, creat: '2026-09-01T10:00:00.000Z' },
];
const errorFn = (code, message) => Object.assign(new Error(message), { code: `functions/${code}` });

// Respostes de les callables per nom; una funció rep les dades.
let respostes;
beforeEach(() => {
  mockCrida.mockReset();
  respostes = {
    llistarUsuarisTaquilla: () => USUARIS.map((u) => ({ ...u })),
    canviarEstatUsuariTaquilla: ({ desactivat }) => ({ desactivat }),
    restablirContrasenyaUsuariTaquilla: () => ({ enllac: ENLLAC, correuEnviat: true }),
    eliminarUsuariTaquilla: () => ({ eliminat: true }),
    crearUsuariTaquilla: () => ({ uid: 'u9', enllac: ENLLAC, correuEnviat: true }),
    editarUsuariTaquilla: () => ({ enllac: null, correuEnviat: false }),
  };
  mockCrida.mockImplementation(async (nom, dades) => {
    const r = respostes[nom];
    if (r instanceof Error) throw r;
    return { data: typeof r === 'function' ? r(dades) : r };
  });
  getDocs.mockResolvedValue({ docs: [] });
  mockUseAuth.mockReturnValue({ user: { uid: 'admin' }, role: 'admin', loading: false });
});

const cridesA = (nom) => mockCrida.mock.calls.filter(([n]) => n === nom).map(([, d]) => d);

function renderRuta(ruta) {
  return renderAmbConfirmacio(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/usuaris-taquilla" element={<UsuarisTaquillaList />} />
        <Route path="/usuaris-taquilla/nou" element={<UsuariTaquillaNou />} />
        <Route path="/usuaris-taquilla/:uid" element={<UsuariTaquillaFitxa />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Usuaris de taquilla — llistat', () => {
  it('mostra nom, correu, estat, creat i últim accés, i l\'enllaç a la fitxa', async () => {
    renderRuta('/usuaris-taquilla');
    const anna = (await screen.findByRole('link', { name: 'Anna Puig' })).closest('li');
    expect(screen.getByRole('heading', { level: 1, name: 'Usuaris de taquilla' })).toBeInTheDocument();
    expect(within(anna).getByText('anna@example.com')).toBeInTheDocument();
    expect(within(anna).getByText('Actiu')).toBeInTheDocument();
    expect(within(anna).getByText(/^Creat: /)).toBeInTheDocument();
    expect(within(anna).getByText(/^Últim accés: /).textContent).not.toContain('Mai');
    expect(screen.getByRole('link', { name: 'Anna Puig' })).toHaveAttribute('href', '/usuaris-taquilla/u1');
    const pere = screen.getByRole('link', { name: 'Pere Vidal' }).closest('li');
    expect(within(pere).getByText('Desactivat')).toBeInTheDocument();
    expect(within(pere).getByText('Últim accés: Mai')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Nou usuari' })).toHaveAttribute('href', '/usuaris-taquilla/nou');
  });

  it('filtra per nom o correu', async () => {
    const user = userEvent.setup();
    renderRuta('/usuaris-taquilla');
    await screen.findByRole('link', { name: 'Anna Puig' });
    await user.type(screen.getByRole('searchbox', { name: 'Cerca un usuari' }), 'PERE@');
    expect(screen.queryByRole('link', { name: 'Anna Puig' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pere Vidal' })).toBeInTheDocument();
    await user.clear(screen.getByRole('searchbox', { name: 'Cerca un usuari' }));
    await user.type(screen.getByRole('searchbox', { name: 'Cerca un usuari' }), 'zzz');
    expect(screen.getByText('Cap usuari coincideix amb la cerca.')).toBeInTheDocument();
  });

  it('mostra un error si no es pot carregar', async () => {
    respostes.llistarUsuarisTaquilla = errorFn('internal', 'internal');
    renderRuta('/usuaris-taquilla');
    expect(await screen.findByRole('alert')).toHaveTextContent("No s'han pogut carregar els usuaris de taquilla.");
    respostes.llistarUsuarisTaquilla = () => [];
    fireEvent.click(screen.getByRole('button', { name: 'Torna-ho a provar' }));
    expect(await screen.findByText('Encara no hi ha cap usuari de taquilla.')).toBeInTheDocument();
  });

  it('mostra un missatge clar si no hi ha permís', async () => {
    respostes.llistarUsuarisTaquilla = errorFn('permission-denied', 'Només l\'admin pot gestionar els usuaris.');
    renderRuta('/usuaris-taquilla');
    expect(await screen.findByRole('alert')).toHaveTextContent('No tens permís per fer aquesta acció.');
  });

  it('llista buida', async () => {
    respostes.llistarUsuarisTaquilla = [];
    renderRuta('/usuaris-taquilla');
    expect(await screen.findByText('Encara no hi ha cap usuari de taquilla.')).toBeInTheDocument();
  });

  it('desactiva i reactiva', async () => {
    const user = userEvent.setup();
    renderRuta('/usuaris-taquilla');
    await user.click(await screen.findByRole('button', { name: 'Desactiva Anna Puig' }));
    expect(cridesA('canviarEstatUsuariTaquilla')).toEqual([{ uid: 'u1', desactivat: true }]);
    const anna = screen.getByRole('link', { name: 'Anna Puig' }).closest('li');
    await waitFor(() => expect(within(anna).getByText('Desactivat')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Reactiva Pere Vidal' }));
    expect(cridesA('canviarEstatUsuariTaquilla')[1]).toEqual({ uid: 'u2', desactivat: false });
    const pere = screen.getByRole('link', { name: 'Pere Vidal' }).closest('li');
    await waitFor(() => expect(within(pere).getByText('Actiu')).toBeInTheDocument());
  });

  it('restablir: si falla, mostra el missatge del servidor a la fila', async () => {
    const user = userEvent.setup();
    respostes.restablirContrasenyaUsuariTaquilla = errorFn('unavailable', 'x');
    renderRuta('/usuaris-taquilla');
    await user.click(await screen.findByRole('button', { name: 'Restableix la contrasenya de Anna Puig' }));
    await acceptaDialeg('Restableix');
    const anna = screen.getByRole('link', { name: 'Anna Puig' }).closest('li');
    expect(await within(anna).findByRole('alert')).toHaveTextContent("No s'ha pogut connectar amb el servidor.");
  });

  it('restablir: si la contrasenya s\'ha anul·lat però no hi ha enllaç, ho diu', async () => {
    const user = userEvent.setup();
    respostes.restablirContrasenyaUsuariTaquilla = errorFn('aborted', "S'ha anul·lat la contrasenya, però no s'ha pogut generar l'enllaç. Torna-ho a provar.");
    renderRuta('/usuaris-taquilla');
    await user.click(await screen.findByRole('button', { name: 'Restableix la contrasenya de Anna Puig' }));
    await acceptaDialeg('Restableix');
    expect(await screen.findByRole('alert')).toHaveTextContent("S'ha anul·lat la contrasenya, però no s'ha pogut generar l'enllaç.");
  });

  it('mostra l\'error d\'una acció a la fila', async () => {
    const user = userEvent.setup();
    respostes.canviarEstatUsuariTaquilla = errorFn('permission-denied', 'Aquest usuari no és de taquilla.');
    renderRuta('/usuaris-taquilla');
    await user.click(await screen.findByRole('button', { name: 'Desactiva Anna Puig' }));
    const anna = screen.getByRole('link', { name: 'Anna Puig' }).closest('li');
    expect(await within(anna).findByRole('alert')).toHaveTextContent('No tens permís per fer aquesta acció.');
    expect(within(anna).getByText('Actiu')).toBeInTheDocument();
  });

  it('restableix la contrasenya i mostra l\'enllaç copiable; un usuari desactivat no en pot rebre', async () => {
    const user = userEvent.setup();
    renderRuta('/usuaris-taquilla');
    expect(await screen.findByRole('button', { name: 'Restableix la contrasenya de Pere Vidal' })).toBeDisabled();
    // Cancel·lar no fa res.
    await user.click(screen.getByRole('button', { name: 'Restableix la contrasenya de Anna Puig' }));
    await cancellaDialeg(user);
    expect(cridesA('restablirContrasenyaUsuariTaquilla')).toEqual([]);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Restableix la contrasenya de Anna Puig' })).toBeEnabled());

    await user.click(screen.getByRole('button', { name: 'Restableix la contrasenya de Anna Puig' }));
    const dialeg = await acceptaDialeg('Restableix');
    expect(dialeg).toHaveTextContent('deixarà de funcionar ara mateix');
    await waitFor(() => expect(cridesA('restablirContrasenyaUsuariTaquilla')).toEqual([{ uid: 'u1' }]));
    expect(await screen.findByText(/S'ha enviat un correu a/)).toHaveTextContent('anna@example.com');
    expect(screen.getByText("La contrasenya actual deixarà de funcionar fins que la persona triï la nova amb l'enllaç.")).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Enllaç per triar la contrasenya' })).toHaveValue(ENLLAC);
  });

  it('elimina després de confirmar; si es cancel·la no fa res', async () => {
    const user = userEvent.setup();
    renderRuta('/usuaris-taquilla');
    await user.click(await screen.findByRole('button', { name: 'Elimina Anna Puig' }));
    await cancellaDialeg(user);
    expect(cridesA('eliminarUsuariTaquilla')).toEqual([]);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Elimina Anna Puig' })).toBeEnabled());

    await user.click(screen.getByRole('button', { name: 'Elimina Anna Puig' }));
    const dialeg = await acceptaDialeg('Elimina');
    expect(dialeg).toHaveTextContent('no es pot desfer');
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Anna Puig' })).not.toBeInTheDocument());
    expect(cridesA('eliminarUsuariTaquilla')).toEqual([{ uid: 'u1' }]);
  });
});

describe('Usuaris de taquilla — alta', () => {
  it('crea l\'usuari i mostra el correu enviat i l\'enllaç per copiar', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderRuta('/usuaris-taquilla/nou');
    await user.type(screen.getByLabelText('Nom'), '  Marta Soler ');
    await user.type(screen.getByLabelText('Correu electrònic'), 'Marta@Example.com');
    await user.click(screen.getByRole('button', { name: "Crea l'usuari" }));
    expect(cridesA('crearUsuariTaquilla')).toEqual([{ nom: 'Marta Soler', correu: 'marta@example.com' }]);
    expect(await screen.findByText(/S'ha enviat un correu a/)).toHaveTextContent("S'ha enviat un correu a marta@example.com perquè triï la seva contrasenya");
    expect(screen.getByRole('textbox', { name: 'Enllaç per triar la contrasenya' })).toHaveValue(ENLLAC);
    expect(screen.getByText(/L'enllaç és personal/)).toBeInTheDocument();
    // Un compte nou no tenia cap contrasenya en ús.
    expect(screen.queryByText(/La contrasenya actual deixarà de funcionar/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: "Copia l'enllaç" }));
    expect(writeText).toHaveBeenCalledWith(ENLLAC);
    expect(await screen.findByText("S'ha copiat l'enllaç.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: "Veure la fitxa de l'usuari" })).toHaveAttribute('href', '/usuaris-taquilla/u9');
  });

  it('si el correu no surt, ho diu i deixa l\'enllaç', async () => {
    const user = userEvent.setup();
    respostes.crearUsuariTaquilla = { uid: 'u9', enllac: ENLLAC, correuEnviat: false };
    renderRuta('/usuaris-taquilla/nou');
    await user.type(screen.getByLabelText('Nom'), 'Marta');
    await user.type(screen.getByLabelText('Correu electrònic'), 'marta@example.com');
    await user.click(screen.getByRole('button', { name: "Crea l'usuari" }));
    expect(await screen.findByRole('heading', { name: "No s'ha pogut enviar el correu" })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Enllaç per triar la contrasenya' })).toHaveValue(ENLLAC);
  });

  it('valida els camps abans d\'enviar', async () => {
    const user = userEvent.setup();
    renderRuta('/usuaris-taquilla/nou');
    await user.type(screen.getByLabelText('Correu electrònic'), 'no-es-correu');
    await user.click(screen.getByRole('button', { name: "Crea l'usuari" }));
    expect(screen.getByText('Escriu el nom.')).toBeInTheDocument();
    expect(screen.getByText('El correu electrònic no és vàlid.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nom')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Nom')).toHaveFocus();
    expect(mockCrida).not.toHaveBeenCalled();
  });

  it('correu en ús: error al camp', async () => {
    const user = userEvent.setup();
    respostes.crearUsuariTaquilla = errorFn('already-exists', 'Aquest correu ja està en ús.');
    renderRuta('/usuaris-taquilla/nou');
    await user.type(screen.getByLabelText('Nom'), 'Marta');
    await user.type(screen.getByLabelText('Correu electrònic'), 'marta@example.com');
    await user.click(screen.getByRole('button', { name: "Crea l'usuari" }));
    expect(await screen.findByText('Aquest correu ja està en ús.')).toHaveAttribute('id', 'correu-error');
    expect(screen.getByLabelText('Correu electrònic')).toHaveAttribute('aria-invalid', 'true');
  });

  it('límit superat: missatge del servidor', async () => {
    const user = userEvent.setup();
    respostes.crearUsuariTaquilla = errorFn('resource-exhausted', "S'han creat 10 usuaris en l'última hora. Torna-ho a provar més tard.");
    renderRuta('/usuaris-taquilla/nou');
    await user.type(screen.getByLabelText('Nom'), 'Marta');
    await user.type(screen.getByLabelText('Correu electrònic'), 'marta@example.com');
    await user.click(screen.getByRole('button', { name: "Crea l'usuari" }));
    expect(await screen.findByRole('alert')).toHaveTextContent("S'han creat 10 usuaris en l'última hora.");
  });

  it('error desconegut: missatge genèric (no el del servidor)', async () => {
    const user = userEvent.setup();
    respostes.crearUsuariTaquilla = errorFn('internal', 'INTERNAL stack trace');
    renderRuta('/usuaris-taquilla/nou');
    await user.type(screen.getByLabelText('Nom'), 'Marta');
    await user.type(screen.getByLabelText('Correu electrònic'), 'marta@example.com');
    await user.click(screen.getByRole('button', { name: "Crea l'usuari" }));
    expect(await screen.findByRole('alert')).toHaveTextContent("No s'ha pogut crear l'usuari. Torna-ho a provar.");
  });
});

describe('Usuaris de taquilla — fitxa', () => {
  const ts = (iso) => ({ toMillis: () => Date.parse(iso), toDate: () => new Date(iso) });

  it('mostra els detalls i l\'historial de l\'usuari (més recent primer)', async () => {
    getDocs.mockResolvedValue({
      docs: [
        { id: 'a1', data: () => ({ accio: 'crear', actorCorreu: 'admin@example.com', objectiuUid: 'u1', timestamp: ts('2026-08-01T10:00:00Z') }) },
        { id: 'a2', data: () => ({ accio: 'desactivar', actorCorreu: 'admin@example.com', objectiuUid: 'u1', timestamp: ts('2026-09-01T10:00:00Z') }) },
      ],
    });
    renderRuta('/usuaris-taquilla/u1');
    expect(await screen.findByRole('heading', { level: 1, name: 'Anna Puig' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nom')).toHaveValue('Anna Puig');
    expect(screen.getByLabelText('Correu electrònic')).toHaveValue('anna@example.com');
    expect(where).toHaveBeenCalledWith('objectiuUid', '==', 'u1');
    const historial = screen.getByRole('heading', { name: 'Historial' }).closest('section');
    await waitFor(() => expect(within(historial).getAllByRole('listitem')).toHaveLength(2));
    expect(within(historial).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('Desactivat'), expect.stringContaining('Creat'),
    ]);
  });

  it('si no es pot carregar l\'usuari, ho diu i «Torna-ho a provar» torna a llegir', async () => {
    respostes.llistarUsuarisTaquilla = errorFn('internal', 'internal');
    renderRuta('/usuaris-taquilla/u1');
    expect(await screen.findByRole('alert')).toHaveTextContent("No s'ha pogut carregar l'usuari.");
    respostes.llistarUsuarisTaquilla = () => USUARIS.map((u) => ({ ...u }));
    fireEvent.click(screen.getByRole('button', { name: 'Torna-ho a provar' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Anna Puig' })).toBeInTheDocument();
  });

  it('si no es pot llegir l\'historial, ho diu dins la secció i es pot reintentar', async () => {
    getDocs.mockRejectedValueOnce(new Error('unavailable'));
    renderRuta('/usuaris-taquilla/u1');
    const historial = (await screen.findByRole('heading', { name: 'Historial' })).closest('section');
    expect(await within(historial).findByRole('alert')).toHaveTextContent("No s'ha pogut carregar l'historial.");
    fireEvent.click(within(historial).getByRole('button', { name: 'Torna-ho a provar' }));
    expect(await within(historial).findByText('Encara no hi ha cap canvi registrat.')).toBeInTheDocument();
  });

  it('usuari inexistent (o no de taquilla): avís', async () => {
    renderRuta('/usuaris-taquilla/admin');
    expect(await screen.findByRole('alert')).toHaveTextContent('Aquest usuari no existeix o no és de taquilla.');
  });

  it('desa el nom amb la barra Desar', async () => {
    const user = userEvent.setup();
    renderRuta('/usuaris-taquilla/u1');
    const nom = await screen.findByLabelText('Nom');
    await user.clear(nom);
    await user.type(nom, 'Anna P.');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await waitFor(() => expect(cridesA('editarUsuariTaquilla')).toEqual([{ uid: 'u1', nom: 'Anna P.', correu: 'anna@example.com' }]));
    expect(await screen.findByRole('heading', { level: 1, name: 'Anna P.' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Enllaç per triar la contrasenya' })).not.toBeInTheDocument();
  });

  it('en canviar el correu mostra l\'enllaç enviat a la nova adreça', async () => {
    const user = userEvent.setup();
    respostes.editarUsuariTaquilla = { enllac: ENLLAC, correuEnviat: true };
    renderRuta('/usuaris-taquilla/u1');
    const correu = await screen.findByLabelText('Correu electrònic');
    await user.clear(correu);
    await user.type(correu, 'anna.nova@example.com');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await screen.findByText(/S'ha enviat un correu a/)).toHaveTextContent('anna.nova@example.com');
    expect(screen.getByText("La contrasenya actual deixarà de funcionar fins que la persona triï la nova amb l'enllaç.")).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Enllaç per triar la contrasenya' })).toHaveValue(ENLLAC);
  });

  it('correu nou en ús: error al camp', async () => {
    const user = userEvent.setup();
    respostes.editarUsuariTaquilla = errorFn('already-exists', 'Aquest correu ja està en ús.');
    renderRuta('/usuaris-taquilla/u1');
    const correu = await screen.findByLabelText('Correu electrònic');
    await user.clear(correu);
    await user.type(correu, 'altre@example.com');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await screen.findByText('Aquest correu ja està en ús.', { selector: '#correu-error' })).toBeInTheDocument();
  });

  it('desactiva i restableix des de la fitxa', async () => {
    const user = userEvent.setup();
    renderRuta('/usuaris-taquilla/u1');
    await user.click(await screen.findByRole('button', { name: 'Restableix la contrasenya de Anna Puig' }));
    await acceptaDialeg('Restableix');
    expect(await screen.findByRole('textbox', { name: 'Enllaç per triar la contrasenya' })).toHaveValue(ENLLAC);
    await user.click(screen.getByRole('button', { name: 'Desactiva Anna Puig' }));
    expect(cridesA('canviarEstatUsuariTaquilla')).toEqual([{ uid: 'u1', desactivat: true }]);
    expect(await screen.findByText('Desactivat')).toBeInTheDocument();
    // En desactivar-lo, l'enllaç ja no serveix: deixa de mostrar-se.
    expect(screen.queryByRole('textbox', { name: 'Enllaç per triar la contrasenya' })).not.toBeInTheDocument();
  });

  it('elimina des de la zona de perill i torna al llistat', async () => {
    const user = userEvent.setup();
    renderRuta('/usuaris-taquilla/u1');
    await user.click(await screen.findByRole('button', { name: "Elimina l'usuari" }));
    await acceptaDialeg('Elimina');
    await waitFor(() => expect(cridesA('eliminarUsuariTaquilla')).toEqual([{ uid: 'u1' }]));
    expect(await screen.findByRole('heading', { level: 1, name: 'Usuaris de taquilla' })).toBeInTheDocument();
  });
});

describe('Usuaris de taquilla — accés', () => {
  function renderProtegit(ruta) {
    return render(
      <MemoryRouter initialEntries={[ruta]}>
        <Routes>
          <Route path="/accedir" element={<p>Pantalla d&apos;accés</p>} />
          {['/usuaris-taquilla', '/usuaris-taquilla/nou', '/usuaris-taquilla/:uid'].map((path) => (
            <Route
              key={path}
              path={path}
              element={<RequireAuth><RequireRole roles={['admin']}><UsuarisTaquillaList /></RequireRole></RequireAuth>}
            />
          ))}
        </Routes>
      </MemoryRouter>
    );
  }

  it.each(['/usuaris-taquilla', '/usuaris-taquilla/nou', '/usuaris-taquilla/u1'])('taquilla no hi pot entrar (%s)', (ruta) => {
    mockUseAuth.mockReturnValue({ user: { uid: 't' }, role: 'taquilla', loading: false });
    renderProtegit(ruta);
    expect(screen.getByText("Pantalla d'accés")).toBeInTheDocument();
    expect(mockCrida).not.toHaveBeenCalled();
  });

  it.each(['/usuaris-taquilla', '/usuaris-taquilla/nou'])('sense sessió no hi pot entrar (%s)', (ruta) => {
    mockUseAuth.mockReturnValue({ user: null, role: null, loading: false });
    renderProtegit(ruta);
    expect(screen.getByText("Pantalla d'accés")).toBeInTheDocument();
    expect(mockCrida).not.toHaveBeenCalled();
  });
});
