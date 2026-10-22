import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { urlPublica } from '../../lib/redireccioPropostes';

// Redirecció del costat del client (a Firebase Hosting amb rewrites SPA no n'hi ha cap altra).
export default function RedireccioPropostes() {
  const { pathname } = useLocation();
  const desti = urlPublica(pathname, window.location.hash);

  useEffect(() => {
    if (desti) window.location.replace(desti);
  }, [desti]);

  if (!desti) return null;
  return (
    <p>
      <a href={desti}>Les propostes han canviat d'adreça: continua aquí</a>
    </p>
  );
}
