import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import * as ROUTES from '../constants/routes';

export default function Accedir() {
  const { user, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [enviant, setEnviant] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!user) return;
    const desti = location.state?.from?.pathname || ROUTES.SOCIS;
    navigate(desti, { replace: true });
  }, [user, location.state, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setEnviant(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch {
      setError('Correu o contrasenya incorrectes.');
      setEnviant(false);
    }
  };

  return (
    <form className="accedir" onSubmit={handleSubmit}>
      <h1 className="accedir__titol">Accedir</h1>
      <div className="form__field">
        <label className="form__label" htmlFor="email">Correu electrònic</label>
        <input id="email" className="form__input" type="email" value={email}
          onChange={(e) => setEmail(e.target.value)} required autoFocus />
      </div>
      <div className="form__field">
        <label className="form__label" htmlFor="password">Contrasenya</label>
        <input id="password" className="form__input" type="password" value={password}
          onChange={(e) => setPassword(e.target.value)} required />
      </div>
      {error && <p className="form__error">{error}</p>}
      <button className="btn" type="submit" disabled={enviant}>
        {enviant ? 'Accedint…' : 'Accedir'}
      </button>
    </form>
  );
}
