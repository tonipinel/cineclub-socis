import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { ROLE_ADMIN, ROLE_TAQUILLA } from '../constants/roles';
import * as ROUTES from '../constants/routes';

export default function Header() {
  const { user, role, signOut } = useAuth();

  return (
    <header className="site-header">
      <span className="site-header__brand">Cineclub Roda de Berà</span>
      {user && role === ROLE_ADMIN && (
        <nav className="site-header__nav">
          <Link className="site-header__link" to={ROUTES.SOCIS}>Socis</Link>
          <Link className="site-header__link" to={ROUTES.SOLICITUDS}>Sol·licituds</Link>
          <Link className="site-header__link" to={ROUTES.SESSIONS}>Sessions</Link>
          <Link className="site-header__link" to={ROUTES.TICKETS}>Tiquets</Link>
          <Link className="site-header__link" to={ROUTES.ESCANEIG}>Escaneig</Link>
          <button className="site-header__link" type="button" onClick={signOut}>Sortir</button>
        </nav>
      )}
      {user && role === ROLE_TAQUILLA && (
        <nav className="site-header__nav">
          <Link className="site-header__link" to={ROUTES.ESCANEIG}>Escaneig</Link>
          <button className="site-header__link" type="button" onClick={signOut}>Sortir</button>
        </nav>
      )}
    </header>
  );
}
