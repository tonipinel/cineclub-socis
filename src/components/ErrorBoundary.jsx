import { Component } from 'react';
import * as ROUTES from '../constants/routes';
import PaginaAdmin from './PaginaAdmin';
import { TEXT_REINTENT } from './ErrorCarrega';

// Fragment (import() d'una pantalla) que no s'ha pogut baixar: el cas típic és una pestanya oberta d'abans d'un
// desplegament. Tornar a renderitzar no serveix (React recorda la importació fallida): cal recarregar la pàgina.
const ERROR_FRAGMENT = /dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;
export const esErrorDeFragment = (error) => ERROR_FRAGMENT.test(error?.message ?? '');

// Un error de render (o un fragment que no es pot carregar) no deixa la pantalla en blanc: es mostra un
// missatge amb «Torna-ho a provar» (torna a renderitzar) i «Torna a l'inici». `clauReinici` (la ruta) el
// restableix en navegar. No fa servir el router: també serveix fora de `BrowserRouter`.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.reintenta = () => this.setState({ error: null });
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Error de la interfície:', error, info?.componentStack);
  }

  componentDidUpdate(anteriors) {
    if (this.state.error && anteriors.clauReinici !== this.props.clauReinici) this.reintenta();
  }

  render() {
    if (!this.state.error) return this.props.children;
    const fragment = esErrorDeFragment(this.state.error);
    return (
      <PaginaAdmin amplada="formulari" titol="Alguna cosa ha anat malament">
        <div className="error-carrega">
          <p className="error-carrega__missatge" role="alert">
            {fragment
              ? 'No s\'ha pogut carregar aquesta pantalla. Pot ser que hi hagi una versió nova de l\'aplicació: torna-ho a provar o torna a l\'inici.'
              : 'No s\'ha pogut mostrar aquesta pantalla. Torna-ho a provar o torna a l\'inici.'}
          </p>
          <div className="error-carrega__accions">
            <button type="button" className="btn error-carrega__boto" onClick={fragment ? () => window.location.reload() : this.reintenta}>{TEXT_REINTENT}</button>
            <a className="btn btn--outline error-carrega__boto" href={ROUTES.INICI}>Torna a l&apos;inici</a>
          </div>
        </div>
      </PaginaAdmin>
    );
  }
}
