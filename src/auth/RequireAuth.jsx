import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth';
import * as ROUTES from '../constants/routes';
import Carregant from '../components/Carregant';

export function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Carregant />;
  if (!user) return <Navigate to={ROUTES.ACCEDIR} state={{ from: location }} replace />;
  return children;
}
