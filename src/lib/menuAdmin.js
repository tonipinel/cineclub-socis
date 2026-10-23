import * as ROUTES from '../constants/routes';

// `comptador` enllaça un element amb el comptador de pendents del Header.
export const GRUPS_ADMIN = [
  {
    id: 'socis',
    etiqueta: 'Socis',
    icona: 'socis',
    elements: [
      { to: ROUTES.SOCIS, etiqueta: 'Socis' },
      { to: ROUTES.SOLICITUDS, etiqueta: 'Sol·licituds', comptador: 'solicituds' },
    ],
  },
  {
    id: 'programacio',
    etiqueta: 'Programació',
    icona: 'sessions',
    elements: [
      { to: ROUTES.PROPOSTES_PENDENTS, etiqueta: 'Propostes', comptador: 'propostes' },
      { to: ROUTES.TANDES, etiqueta: 'Tandes' },
      { to: ROUTES.SESSIONS, etiqueta: 'Sessions' },
      { to: ROUTES.DISTRIBUIDORES, etiqueta: 'Distribuïdores' },
      { to: ROUTES.ENTITATS, etiqueta: 'Entitats' },
    ],
  },
  {
    id: 'sala',
    etiqueta: 'Sala',
    icona: 'escaneig',
    elements: [
      { to: ROUTES.ESCANEIG, etiqueta: 'Escaneig' },
      { to: ROUTES.TICKETS, etiqueta: 'Tiquets' },
    ],
  },
];

const coincideix = (pathname, ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`);

export function grupActiu(pathname) {
  return GRUPS_ADMIN.find((g) => g.elements.some((e) => coincideix(pathname, e.to))) ?? null;
}
