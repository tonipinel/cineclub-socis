import { Link } from 'react-router-dom';
import * as ROUTES from '../../constants/routes';
import { CLASSE_ESTAT, etiquetaEstat } from './campsProposta';

// Capçalera de la fitxa: mostra l'estat desat de la proposta, no els canvis pendents.
export default function CapcaleraProposta({
  proposta, tandes, sessio, onProgramar, programant, ambCanvisPendents, actualitzant = false, pujant = false, errorProgramar,
}) {
  // Programar treballa amb les dades desades: no es pot amb canvis pendents ni mentre es recarrega des de TMDB.
  const notaProgramar = (actualitzant && "S'està actualitzant la fitxa des de TMDB…")
    || (pujant && "S'està pujant el cartell…")
    || (ambCanvisPendents && 'Desa els canvis abans de programar la sessió.') || null;
  return (
    <header className="fitxa-proposta__capcalera">
      <Link className="pagina-admin__tornar" to={ROUTES.PROPOSTES_PENDENTS}>← Propostes</Link>
      <div className="fitxa-proposta__capcalera-cos">
        {proposta.imatgeUrl && <img className="fitxa-proposta__cartell" src={proposta.imatgeUrl} alt="" />}
        <div className="fitxa-proposta__capcalera-text">
          <h1 className="fitxa-proposta__titol">{proposta.titol}</h1>
          {proposta.lema && <p className="fitxa-proposta__lema">{proposta.lema}</p>}
          <div className="fitxa-proposta__insignies">
            <span className={`badge ${CLASSE_ESTAT[proposta.estat] ?? ''}`}>{etiquetaEstat(proposta.estat)}</span>
            {tandes.map((t) => (
              <span key={t.id} className={`badge fitxa-proposta__insignia-tanda${t.oberta ? ' badge--especial' : ''}`}>
                {t.oberta ? `${t.nom} · oberta` : t.nom}
              </span>
            ))}
          </div>
          {/* Fins que no s'han llegit les sessions (`sessio === undefined`) no se sap quina acció toca. */}
          {sessio !== undefined && (
            <div className="fitxa-proposta__accions">
              {sessio && (
                <Link className="btn fitxa-proposta__boto-secundari" to={ROUTES.SESSIONS_EDITAR.replace(':id', sessio.id)}>Veure la sessió</Link>
              )}
              {!sessio && proposta.estat === 'aprovada' && (
                <>
                  <button
                    className="btn"
                    type="button"
                    disabled={programant || Boolean(notaProgramar)}
                    aria-describedby={notaProgramar ? 'programar-nota' : undefined}
                    onClick={onProgramar}
                  >
                    Programar sessió
                  </button>
                  {notaProgramar && <p id="programar-nota" className="fitxa-proposta__nota">{notaProgramar}</p>}
                </>
              )}
            </div>
          )}
          {errorProgramar && <p className="form__error" role="alert">{errorProgramar}</p>}
        </div>
      </div>
    </header>
  );
}
