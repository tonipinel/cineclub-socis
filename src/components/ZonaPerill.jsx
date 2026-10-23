import { useId } from 'react';

// Bloc estàndard d'acció destructiva, al final d'una fitxa.
export default function ZonaPerill({ titol = 'Zona de perill', descripcio, children }) {
  const idTitol = useId();
  return (
    <section className="zona-perill" aria-labelledby={idTitol}>
      <h2 id={idTitol} className="zona-perill__titol">{titol}</h2>
      {descripcio && <p className="zona-perill__descripcio">{descripcio}</p>}
      <div className="zona-perill__accions">{children}</div>
    </section>
  );
}
