import { useAuth } from '../../auth/useAuth';
import { ROLE_ADMIN } from '../../constants/roles';
import PaginaAdmin from '../../components/PaginaAdmin';
import { SECCIONS_ADMIN } from './contingutAdmin';
import { SECCIO_ESCANEIG } from './guiaEscaneig';

const INDEX = 'ajuda-index';

// Cada secció és { id, titol, intro?, apartats: [{ id, titol, cos }] }: l'índex i el contingut surten de les
// mateixes dades, així cap enllaç de l'índex apunta a una àncora que no existeix. La taquilla només veu l'escaneig.
export default function AjudaPage() {
  const { role } = useAuth();
  const admin = role === ROLE_ADMIN;
  const seccions = admin ? [...SECCIONS_ADMIN, SECCIO_ESCANEIG] : [SECCIO_ESCANEIG];

  return (
    <PaginaAdmin amplada="formulari" className="ajuda" titol="Ajuda">
      <p className="ajuda__intro">
        {admin
          ? "Què fa cada pantalla de l'administració, com es fan les tasques habituals pas a pas i la guia per registrar les entrades a la porta."
          : 'Com registrar les entrades a la porta pas a pas, i què fer si alguna cosa no funciona.'}
      </p>

      <nav className="ajuda__index" aria-labelledby={INDEX}>
        <h2 id={INDEX} className="ajuda__index-titol">Índex</h2>
        <ol className="ajuda__index-llista">
          {seccions.map((seccio) => (
            <li key={seccio.id} className="ajuda__index-element">
              <a className="ajuda__index-enllac ajuda__index-enllac--seccio" href={`#${seccio.id}`}>{seccio.titol}</a>
              <ol className="ajuda__index-subllista">
                {seccio.apartats.map((apartat) => (
                  <li key={apartat.id}>
                    <a className="ajuda__index-enllac" href={`#${apartat.id}`}>{apartat.titol}</a>
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ol>
      </nav>

      {seccions.map((seccio) => (
        <section key={seccio.id} className="ajuda__seccio" aria-labelledby={seccio.id}>
          <h2 id={seccio.id} className="ajuda__titol-seccio">{seccio.titol}</h2>
          {seccio.intro && <div className="ajuda__cos">{seccio.intro}</div>}
          {seccio.apartats.map((apartat) => (
            <section key={apartat.id} className="ajuda__apartat" aria-labelledby={apartat.id}>
              <h3 id={apartat.id} className="ajuda__titol-apartat">{apartat.titol}</h3>
              <div className="ajuda__cos">{apartat.cos}</div>
            </section>
          ))}
          <a className="ajuda__tornar-index" href={`#${INDEX}`}><span aria-hidden="true">↑</span> Tornar a l&apos;índex</a>
        </section>
      ))}
    </PaginaAdmin>
  );
}
