import { ETIQUETES_CAMPS, esCampEditat } from '../../../lib/fitxaProposta';
import { ACCEPT_IMATGE, idYoutube } from '../../../lib/sessioPublica';
import SelectorFitxer from '../../../components/SelectorFitxer';

// Camp de text d'una URL: l'id de l'input és el nom del camp; la insígnia «Editat a mà» (segons la proposta desada)
// i l'error de validació s'hi lliguen amb `aria-describedby`.
function CampUrl({
  camp, proposta, valors, canvia, errors,
}) {
  const editat = esCampEditat(proposta, camp);
  const error = errors[camp];
  const ids = [editat && `${camp}-editat`, error && `${camp}-error`].filter(Boolean);
  return (
    <div className="form__field">
      <div className="fitxa-proposta__etiqueta-camp">
        <label className="form__label" htmlFor={camp}>{ETIQUETES_CAMPS[camp]}</label>
        {editat && <span id={`${camp}-editat`} className="fitxa-proposta__editat">Editat a mà</span>}
      </div>
      <input
        id={camp}
        className="form__input"
        type="text"
        inputMode="url"
        value={valors[camp]}
        onChange={(e) => canvia(camp, e.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={ids.join(' ') || undefined}
      />
      {error && <p id={`${camp}-error`} className="form__error" role="alert">{error}</p>}
    </div>
  );
}

const esUrlHttp = (valor) => /^https?:\/\//i.test(valor.trim());

// Pestanya editable amb el cartell (pujada a Storage o URL manual) i el tràiler (URL de YouTube amb vista prèvia).
// La pujada la fa el contenidor (`onPujar`): així l'estat «pujant» i l'error sobreviuen a un canvi de pestanya.
export default function MitjansProposta({
  proposta, valors, canvia, errors, pujant, errorPujada, onPujar,
}) {
  const props = { proposta, valors, canvia, errors };
  // La vista prèvia només si el valor és una URL http(s): és el que es pot desar.
  const idTrailer = esUrlHttp(valors.trailerUrl) ? idYoutube(valors.trailerUrl) : '';

  // `SelectorFitxer` buida l'input just després de l'`onChange`: el fitxer es llegeix abans de cap await.
  const triarFitxer = (e) => {
    const [fitxer] = Array.from(e.target.files ?? []);
    if (fitxer) onPujar(fitxer);
  };

  return (
    <div className="fitxa-proposta__targetes">
      <section className="fitxa-proposta__targeta" aria-labelledby="mitjans-cartell">
        <h2 className="fitxa-proposta__targeta-titol" id="mitjans-cartell">Cartell</h2>
        <div className="fitxa-proposta__mitjans-cartell">
          {valors.imatgeUrl
            ? <img className="fitxa-proposta__mitjans-cartell-imatge" src={valors.imatgeUrl} alt="Cartell" loading="lazy" />
            : <div className="fitxa-proposta__mitjans-cartell-imatge fitxa-proposta__mitjans-cartell-imatge--buit" aria-hidden="true" />}
          <div className="fitxa-proposta__mitjans-cartell-camps">
            <div className="form__field">
              <SelectorFitxer
                id="cartell-fitxer"
                etiqueta={valors.imatgeUrl ? 'Canviar el cartell' : 'Pujar un cartell'}
                accept={ACCEPT_IMATGE}
                disabled={pujant}
                onChange={triarFitxer}
              />
              {pujant && <p className="fitxa-proposta__nota" role="status">Pujant…</p>}
              {errorPujada && <p className="form__error" role="alert">{errorPujada}</p>}
            </div>
            <CampUrl camp="imatgeUrl" {...props} />
          </div>
        </div>
      </section>

      <section className="fitxa-proposta__targeta" aria-labelledby="mitjans-trailer">
        <h2 className="fitxa-proposta__targeta-titol" id="mitjans-trailer">Tràiler</h2>
        <CampUrl camp="trailerUrl" {...props} />
        {idTrailer && (
          <iframe
            className="fitxa-proposta__trailer"
            src={`https://www.youtube-nocookie.com/embed/${idTrailer}`}
            title="Tràiler"
            loading="lazy"
            allow="encrypted-media; picture-in-picture"
            allowFullScreen
          />
        )}
      </section>
    </div>
  );
}
