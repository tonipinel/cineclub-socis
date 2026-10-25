import { Component } from 'react';
import * as ROUTES from '../constants/routes';
import PaginaAdmin from './PaginaAdmin';
import { TEXT_REINTENT } from './ErrorCarrega';

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
    return (
      <PaginaAdmin amplada="formulari" titol="Alguna cosa ha anat malament">
        <div className="error-carrega">
          <p className="error-carrega__missatge" role="alert">
            No s&apos;ha pogut mostrar aquesta pantalla. Torna-ho a provar o torna a l&apos;inici.
          </p>
          <div className="error-carrega__accions">
            <button type="button" className="btn error-carrega__boto" onClick={this.reintenta}>{TEXT_REINTENT}</button>
            <a className="btn btn--outline error-carrega__boto" href={ROUTES.INICI}>Torna a l&apos;inici</a>
          </div>
        </div>
      </PaginaAdmin>
    );
  }
}
