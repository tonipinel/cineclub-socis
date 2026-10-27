import { ETIQUETES_CAMPS, esCampEditat } from '../../../lib/fitxaProposta';
import CercadorPellicula from '../../../components/CercadorPellicula';
import TextareaAutomatic from '../../../components/TextareaAutomatic';

const IDIOMES_SINOPSI = { es: 'castellà', en: 'anglès' };
const AJUDA_LLISTA = 'Separats per comes';

const formatValoracio = (valoracio) => Number(valoracio).toLocaleString('ca-ES', { maximumFractionDigits: 1 });

// Camp de la pel·lícula: l'id de l'input és el nom del camp; la insígnia «Editat a mà» (segons la proposta desada),
// l'ajuda, l'avís i l'error s'hi lliguen amb `aria-describedby`.
function Camp({
  camp, proposta, valors, canvia, errors, ajuda, avis, textarea = false, inputMode,
}) {
  const editat = esCampEditat(proposta, camp);
  const error = errors[camp];
  const ids = {
    editat: editat ? `${camp}-editat` : null,
    ajuda: ajuda ? `${camp}-ajuda` : null,
    avis: avis ? `${camp}-avis` : null,
    error: error ? `${camp}-error` : null,
  };
  const comuns = {
    id: camp,
    value: valors[camp],
    onChange: (e) => canvia(camp, e.target.value),
    'aria-invalid': Boolean(error),
    'aria-describedby': Object.values(ids).filter(Boolean).join(' ') || undefined,
  };
  return (
    <div className="form__field">
      <div className="fitxa-proposta__etiqueta-camp">
        <label className="form__label" htmlFor={camp}>{ETIQUETES_CAMPS[camp]}</label>
        {editat && <span id={ids.editat} className="fitxa-proposta__editat">Editat a mà</span>}
      </div>
      {textarea
        ? <TextareaAutomatic mida="llarg" {...comuns} />
        : <input className="form__input" inputMode={inputMode} {...comuns} />}
      {ajuda && <p id={ids.ajuda} className="fitxa-proposta__ajuda">{ajuda}</p>}
      {avis && <p id={ids.avis} className="fitxa-proposta__avis">{avis}</p>}
      {error && <p id={ids.error} className="form__error" role="alert">{error}</p>}
    </div>
  );
}

// Pestanya editable amb les dades de la pel·lícula (les de TMDB i les editades a mà) i el cercador de TMDB.
// Canviar de pel·lícula o actualitzar des de TMDB recarrega la fitxa: amb canvis pendents no es pot.
export default function PelliculaProposta({
  proposta, valors, canvia, errors, ambCanvisPendents, actualitzant, pujant = false, onTriar, onActualitzar, errorTmdb, clauCercador,
}) {
  const bloquejat = ambCanvisPendents || actualitzant || pujant;
  const props = { proposta, valors, canvia, errors };
  const idioma = IDIOMES_SINOPSI[proposta.sinopsiIdioma];

  return (
    <div className="fitxa-proposta__targetes">
      {errorTmdb && <p className="form__error" role="alert">{errorTmdb}</p>}

      <section className="fitxa-proposta__targeta" aria-labelledby="pellicula-cerca">
        <h2 className="fitxa-proposta__targeta-titol" id="pellicula-cerca">Cerca i tria la pel·lícula</h2>
        <fieldset className="fitxa-proposta__cercador" disabled={bloquejat}>
          <CercadorPellicula
            key={clauCercador}
            valorInicial={proposta.titol ?? ''}
            triadaInicial={proposta.tmdbId
              ? { tmdbId: proposta.tmdbId, titol: proposta.titol, any: proposta.any ?? '', posterUrl: proposta.imatgeUrl || null }
              : null}
            onTriar={(pellicula) => { if (pellicula) onTriar(pellicula); }}
          />
        </fieldset>
        {pujant && <p className="fitxa-proposta__nota">S&apos;està pujant el cartell…</p>}
        {ambCanvisPendents && (
          <p className="fitxa-proposta__nota">Desa o descarta els canvis abans de canviar de pel·lícula.</p>
        )}
      </section>

      <section className="fitxa-proposta__targeta" aria-labelledby="pellicula-dades">
        <h2 className="fitxa-proposta__targeta-titol" id="pellicula-dades">Dades de la pel·lícula</h2>
        {(proposta.tmdbId || proposta.valoracio || proposta.tmdbUrl) && (
          <div className="fitxa-proposta__tmdb">
            {proposta.valoracio ? (
              <p className="fitxa-proposta__valoracio">
                <span className="fitxa-proposta__etiqueta">Valoració TMDB</span>
                <span>★ {formatValoracio(proposta.valoracio)} / 10</span>
              </p>
            ) : null}
            {proposta.tmdbUrl && (
              <a className="enllac" href={proposta.tmdbUrl} target="_blank" rel="noopener noreferrer">Veure a TMDB</a>
            )}
            {proposta.tmdbId && (
              <div className="fitxa-proposta__actualitzar">
                <button
                  type="button"
                  className="btn fitxa-proposta__boto-secundari"
                  onClick={onActualitzar}
                  disabled={bloquejat}
                  aria-describedby={ambCanvisPendents ? 'actualitzar-nota' : undefined}
                >
                  {actualitzant ? 'Actualitzant…' : 'Actualitzar des de TMDB'}
                </button>
                {ambCanvisPendents && (
                  <p id="actualitzar-nota" className="fitxa-proposta__nota">Desa o descarta els canvis abans d&apos;actualitzar.</p>
                )}
              </div>
            )}
          </div>
        )}
        <fieldset className="fitxa-proposta__camps" disabled={actualitzant}>
          <div className="fitxa-proposta__graella">
            <Camp camp="titol" {...props} />
            <Camp camp="titolLocal" {...props} />
            <Camp camp="any" inputMode="numeric" {...props} />
            <Camp camp="durada" inputMode="numeric" {...props} />
            {['directors', 'guionistes', 'fotografia', 'muntatge', 'musica', 'produccio', 'paisos', 'idiomes', 'generes'].map((camp) => (
              <Camp key={camp} camp={camp} ajuda={AJUDA_LLISTA} {...props} />
            ))}
            <Camp camp="lema" {...props} />
          </div>
          <Camp camp="repartiment" textarea ajuda="Un actor per línia: Nom (Personatge)" {...props} />
          <Camp
            camp="sinopsi"
            textarea
            avis={idioma ? `Aquesta sinopsi és en ${idioma}: tradueix-la aquí.` : null}
            {...props}
          />
        </fieldset>
      </section>
    </div>
  );
}
