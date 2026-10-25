import { Link } from 'react-router-dom';
import PaginaAdmin from './PaginaAdmin';

export const TEXT_REINTENT = 'Torna-ho a provar';

// Una lectura ha fallat: missatge visible i anunciat, amb «Torna-ho a provar». Amb `titol`, ocupa la pàgina
// (dins `PaginaAdmin`, amb el títol i l'enllaç de tornar de la pantalla); sense, és un bloc dins la pàgina.
export default function ErrorCarrega({
  missatge, onReintenta, titol, amplada = 'llista', tornar,
}) {
  const bloc = (
    <div className="error-carrega">
      <p className="error-carrega__missatge" role="alert">{missatge}</p>
      {onReintenta && (
        <button type="button" className="btn btn--outline error-carrega__boto" onClick={onReintenta}>{TEXT_REINTENT}</button>
      )}
    </div>
  );
  if (!titol) return bloc;
  return <PaginaAdmin amplada={amplada} titol={titol} tornar={tornar}>{bloc}</PaginaAdmin>;
}

// Fitxa d'un document que no existeix (id dolent o esborrat): missatge i enllaç de tornada al llistat.
export function DocumentInexistent({
  titol, missatge, tornar, amplada = 'fitxa',
}) {
  return (
    <PaginaAdmin amplada={amplada} titol={titol} tornar={tornar}>
      <div className="error-carrega">
        <p className="error-carrega__missatge" role="alert">{missatge}</p>
        <Link className="btn btn--outline error-carrega__boto" to={tornar.to}>Torna a {tornar.etiqueta}</Link>
      </div>
    </PaginaAdmin>
  );
}
