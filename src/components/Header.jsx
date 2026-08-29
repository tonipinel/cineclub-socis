import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { ROLE_ADMIN } from '../constants/roles';
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
          <button className="site-header__link" type="button" onClick={signOut}>Sortir</button>
        </nav>
      )}
    </header>
  );
}
