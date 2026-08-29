import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth';
import * as ROUTES from '../constants/routes';

export function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <p className="page-loading">Carregant…</p>;
  if (!user) return <Navigate to={ROUTES.ACCEDIR} state={{ from: location }} replace />;
  return children;
}
