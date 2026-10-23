import { Link } from 'react-router-dom';

// Amplades estàndard de l'admin: llistes 1280 px, fitxes 1024 px, formularis petits 768 px.
export const AMPLADES = {
  llista: 'pagina-admin--llista',
  fitxa: 'pagina-admin--fitxa',
  formulari: 'pagina-admin--formulari',
};

export default function PaginaAdmin({
  amplada = 'llista',
  titol,
  tornar,
  accions,
  as: Element = 'div',
  className,
  children,
  ...resta
}) {
  return (
    <Element className={['pagina-admin', AMPLADES[amplada] ?? AMPLADES.llista, className].filter(Boolean).join(' ')} {...resta}>
      {titol != null && titol !== false && titol !== '' && (
        <header className="pagina-admin__capcalera">
          {tornar && (
            <Link className="pagina-admin__tornar" to={tornar.to}>← {tornar.etiqueta}</Link>
          )}
          <h1 className="pagina-admin__titol">{titol}</h1>
          {accions && <div className="pagina-admin__accions">{accions}</div>}
        </header>
      )}
      {children}
    </Element>
  );
}
