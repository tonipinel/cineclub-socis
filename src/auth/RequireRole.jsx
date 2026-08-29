import { Navigate } from 'react-router-dom';
import { useAuth } from './useAuth';
import * as ROUTES from '../constants/routes';

export function RequireRole({ roles, children }) {
  const { role, loading } = useAuth();
  if (loading) return null;
  if (!roles.includes(role)) return <Navigate to={ROUTES.ALTA_PUBLICA} replace />;
  return children;
}
