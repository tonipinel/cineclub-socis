import { Link } from 'react-router-dom';
import { urlPublica } from '../../lib/sessioPublica';
import { formatData } from '../../lib/data';
import { imatgeDeSessio } from '../../lib/sessions';
import * as ROUTES from '../../constants/routes';
import EstrellaActiva from '../../components/EstrellaActiva';

function IconaActiva() {
  return (
    <svg
      className="btn-icona__icona"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7Z" />
    </svg>
  );
}

// Capçalera de la fitxa: mostra l'estat desat de la sessió (`original`), no els canvis pendents.
export default function CapcaleraSessio({
  dades, original, onMarcarActiva, errorActiva,
}) {
  const imatge = imatgeDeSessio({ ...dades, publica: original.publica });
  const activa = Boolean(original.activa);

  return (
    <header className="fitxa-sessio__capcalera">
      <Link className="pagina-admin__tornar" to={ROUTES.SESSIONS}>← Sessions</Link>
      <div className="fitxa-sessio__capcalera-cos">
        {imatge && <img className="fitxa-sessio__cartell" src={imatge} alt={original.titol} />}
        <div className="fitxa-sessio__capcalera-text">
          <h1 className="fitxa-sessio__titol">
            {activa && <EstrellaActiva className="fitxa-sessio__estrella" />}
            {original.titol}
          </h1>
          <p className="fitxa-sessio__quan">
            {original.data ? formatData(original.data) : 'Sense data'}
            {original.hora ? ` · ${original.hora}` : ''}
          </p>
          <div className="fitxa-sessio__insignies">
            {original.publicada
              ? <span className="badge fitxa-sessio__insignia--publicada">Publicada</span>
              : <span className="badge">Esborrany</span>}
            {activa && <span className="badge badge--especial">Activa</span>}
          </div>
          <div className="fitxa-sessio__accions">
            {original.publicada && (
              <a className="enllac" href={urlPublica(original.data, original.slug)} target="_blank" rel="noopener noreferrer">
                Veure la pàgina pública ↗
              </a>
            )}
            {!activa && !original.senseControl && (
              <span className="session-form__activar">
                <button
                  type="button"
                  className="btn-icona"
                  aria-label="Marcar com a activa"
                  aria-describedby={original.data ? undefined : 'motiu-activar'}
                  disabled={!original.data}
                  onClick={onMarcarActiva}
                >
                  <IconaActiva />
                </button>
                {!original.data && <span className="session-form__activar-motiu" id="motiu-activar">Cal una data per poder-la activar.</span>}
              </span>
            )}
          </div>
          {errorActiva && <p className="form__error" role="alert">{errorActiva}</p>}
        </div>
      </div>
    </header>
  );
}
