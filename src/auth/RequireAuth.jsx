import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth';
import * as ROUTES from '../constants/routes';
import Carregant from '../components/Carregant';
import ErrorCarrega from '../components/ErrorCarrega';

export function RequireAuth({ children }) {
  const { user, loading, errorSessio, reintentaSessio } = useAuth();
  const location = useLocation();
  if (loading) return <Carregant />;
  // Es queda a la mateixa ruta (p. ex. l'escaneig a la porta) perquè, quan torni la connexió, es pugui reprendre.
  if (errorSessio) {
    return (
      <ErrorCarrega
        titol="Sense connexió"
        amplada="formulari"
        missatge="No s'ha pogut comprovar la sessió. Comprova la connexió i torna-ho a provar."
        onReintenta={reintentaSessio}
      />
    );
  }
  if (!user) return <Navigate to={ROUTES.ACCEDIR} state={{ from: location }} replace />;
  return children;
}
