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
      { to: ROUTES.TICKETS, etiqueta: 'Tiquets' },
    ],
  },
  {
    id: 'propostes',
    etiqueta: 'Propostes',
    icona: 'propostes',
    elements: [
      { to: ROUTES.PROPOSTES_PENDENTS, etiqueta: 'Propostes', comptador: 'propostes' },
      { to: ROUTES.TANDES, etiqueta: 'Tandes' },
      { to: ROUTES.DISTRIBUIDORES, etiqueta: 'Distribuïdores' },
    ],
  },
];

const coincideix = (pathname, ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`);

export function grupActiu(pathname) {
  return GRUPS_ADMIN.find((g) => g.elements.some((e) => coincideix(pathname, e.to))) ?? null;
}
