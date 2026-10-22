import { useState } from 'react';
import { ref, uploadBytes } from 'firebase/storage';
import { storage } from '../../firebase/firebase';
import {
  ACCEPT_IMATGE, AVIS_DESCRIPCIO, camiImatge, esSlugValid, generarSlug, slugDisponible, urlStorage, validarImatge, validarPublicable,
} from '../../lib/sessioPublica';

const FITXA = [
  ['titol', 'Títol públic'],
  ['titolOriginal', 'Títol original'],
  ['titolTraduit', 'Títol traduït'],
  ['titolEspanya', 'Títol a Espanya'],
  ['directors', 'Direcció', 'Separats per comes'],
  ['guio', 'Guió'],
  ['pais', 'País'],
  ['any', 'Any'],
  ['durada', 'Durada (minuts)'],
  ['idioma', 'Idioma'],
  ['versioIdiomatica', 'Versió idiomàtica'],
  ['generes', 'Gèneres', 'Separats per comes'],
  ['fotografia', 'Fotografia'],
  ['muntatge', 'Muntatge'],
  ['musica', 'Música'],
  ['produccio', 'Producció'],
  ['interprets', 'Intèrprets', 'Separats per comes'],
  ['premisDestacats', 'Premis destacats'],
];

const GESTIO = [
  ['preu', "Preu d'entrada (€)", '0 = entrada gratuïta; buit = sense preu'],
  ['queInclou', 'Què inclou'],
  ['edatMinimaRecomanada', 'Edat mínima recomanada', '0 = tots els públics'],
  ['suportDistribucio', 'Suport de distribució'],
  ['organitza', 'Organitza'],
  ['participa', 'Participen', 'Noms de les entitats, separats per comes'],
  ['collabora', 'Col·laboren', 'Noms de les entitats, separats per comes'],
];

const VERSIONS = [
  ['', '—'], ['vo', 'V.O.'], ['vose', 'V.O.S.E.'], ['vosc', 'V.O.S.C.'], ['doblada-cat', 'Doblada al català'], ['doblada-cast', 'Doblada al castellà'],
];
const SECCIONS = [['', 'Cartellera (per defecte)'], ['cartellera', 'Cartellera'], ['xarxa', 'Xarxa'], ['extra', 'Extra']];

const ESQUELET = "## Sinopsi\n\n\n\n## Context\n\n\n\n## Curiositats\n\n\n\n## Per què l'hem programat?\n\n";

const MOTIU_SENSE_SLUG = 'Cal un slug per poder pujar imatges.';

function Camp({ camp, etiqueta, ajuda, avis, form, onCanvi, errors, children }) {
  const idAjuda = ajuda ? `publica-${camp}-ajuda` : undefined;
  const idError = errors[camp] ? `publica-${camp}-error` : undefined;
  return (
    <div className="form__field">
      <label className="form__label" htmlFor={`publica-${camp}`}>{etiqueta}</label>
      {children ?? (
        <input
          id={`publica-${camp}`}
          className="form__input"
          value={form[camp]}
          onChange={(e) => onCanvi(camp, e.target.value)}
          aria-invalid={Boolean(idError)}
          aria-describedby={[idAjuda, idError].filter(Boolean).join(' ') || undefined}
        />
      )}
      {ajuda && <p id={idAjuda} className="form__ajuda">{ajuda}</p>}
      {idError && <p id={idError} className="form__error">{errors[camp]}</p>}
      {!idError && avis && <p className="pagina-publica__avis">{avis}</p>}
    </div>
  );
}

export default function PaginaPublicaSessio({
  obert, onToggle, form, onCanvi, sessio, onCanviSessio, altresSessions, errors, urlPagina,
}) {
  const [errorImatge, setErrorImatge] = useState(null);
  const [pujant, setPujant] = useState(false);
  const slug = sessio.slug ?? '';
  const any = typeof sessio.data === 'string' ? sessio.data.slice(0, 4) : '';
  const suggeriment = generarSlug(form.titol || sessio.titol);
  const slugRepetit = slug && !slugDisponible(slug, sessio.data, altresSessions, sessio.id);
  const { avisos } = validarPublicable({ ...sessio, publica: { cartell: form.cartell } }, altresSessions);
  const potPujar = esSlugValid(slug) && !pujant;
  const props = { form, onCanvi, errors };

  const pujar = async (fitxers, tipus) => {
    setErrorImatge(null);
    const error = fitxers.map(validarImatge).find(Boolean);
    if (error) {
      setErrorImatge(error);
      return [];
    }
    setPujant(true);
    try {
      const instant = Date.now();
      return await Promise.all(fitxers.map(async (fitxer, i) => {
        const cami = camiImatge(slug, tipus, fitxer, instant, tipus === 'gallery' ? i + 1 : undefined);
        await uploadBytes(ref(storage, cami), fitxer, { contentType: fitxer.type });
        return urlStorage(storage.app.options.storageBucket, cami);
      }));
    } catch {
      setErrorImatge("No s'ha pogut pujar la imatge. Torna-ho a provar.");
      return [];
    } finally {
      setPujant(false);
    }
  };

  const handleCartell = async (e) => {
    const fitxers = [...e.target.files];
    e.target.value = '';
    const [url] = await pujar(fitxers.slice(0, 1), 'poster');
    if (url) onCanvi('cartell', url);
  };

  const handleGaleria = async (e) => {
    const fitxers = [...e.target.files];
    e.target.value = '';
    const urls = await pujar(fitxers, 'gallery');
    if (urls.length) onCanvi('galeria', [...form.galeria, ...urls]);
  };

  const moure = (i, desti) => {
    const galeria = [...form.galeria];
    [galeria[i], galeria[desti]] = [galeria[desti], galeria[i]];
    onCanvi('galeria', galeria);
  };

  const errorsPublicar = ['titol', 'data', 'slug'].filter((camp) => errors.publicar?.[camp]);

  return (
    <section className="pagina-publica" aria-labelledby="pagina-publica-titol">
      <h2 className="pagina-publica__capcalera" id="pagina-publica-titol">
        <button
          type="button"
          className="pagina-publica__toggle"
          aria-expanded={obert}
          aria-controls="pagina-publica-contingut"
          onClick={onToggle}
        >
          Pàgina pública
        </button>
        <span className={sessio.publicada ? 'badge pagina-publica__estat--publicada' : 'badge'}>
          {sessio.publicada ? 'Publicada' : 'No publicada'}
        </span>
      </h2>

      {obert && (
        <div className="pagina-publica__contingut" id="pagina-publica-contingut">
          {errorsPublicar.length > 0 && (
            <div className="pagina-publica__errors" role="alert" aria-label="No es pot publicar">
              <p className="pagina-publica__errors-titol">No es pot publicar:</p>
              <ul className="pagina-publica__errors-llista">
                {errorsPublicar.map((camp) => <li key={camp}>{errors.publicar[camp]}</li>)}
              </ul>
            </div>
          )}

          <div className="pagina-publica__barra">
            <label className="form__casella">
              <input
                type="checkbox"
                checked={Boolean(sessio.publicada)}
                onChange={(e) => onCanviSessio('publicada', e.target.checked)}
              />
              Publicada
            </label>
            {urlPagina && (
              <a className="enllac" href={urlPagina} target="_blank" rel="noopener noreferrer">
                Veure la pàgina pública ↗
              </a>
            )}
          </div>
          {sessio.publicada && avisos.cartell && (
            <p className="pagina-publica__avis">
              La sessió no té cartell: es pot publicar, però la pàgina sortirà sense imatge.
            </p>
          )}

          <div className="form__field">
            <label className="form__label" htmlFor="publica-slug">Slug</label>
            <input
              id="publica-slug"
              className="form__input"
              value={slug}
              placeholder={suggeriment}
              onChange={(e) => onCanviSessio('slug', e.target.value.trim())}
              aria-describedby="publica-slug-ajuda"
            />
            <p id="publica-slug-ajuda" className="form__ajuda">
              {any && slug ? `URL: /programacio/${any}/${slug}/` : 'Minúscules, xifres i guions. Forma part de la URL.'}
            </p>
            {!slug && suggeriment && (
              <button type="button" className="btn btn--outline pagina-publica__boto-petit" onClick={() => onCanviSessio('slug', suggeriment)}>
                Fer servir «{suggeriment}»
              </button>
            )}
            {slugRepetit && <p className="pagina-publica__avis">Ja hi ha una altra sessió amb aquest slug el {any}.</p>}
          </div>

          {form.aliases.length > 0 && (
            <div className="form__field">
              <span className="form__label">URL antigues (aliases)</span>
              <ul className="pagina-publica__aliases">
                {form.aliases.map((alias) => <li key={alias}>{alias}</li>)}
              </ul>
            </div>
          )}

          <h3 className="pagina-publica__subtitol">Imatges</h3>
          {errorImatge && <p className="form__error" role="alert">{errorImatge}</p>}
          <div className="pagina-publica__imatges">
            <div className="pagina-publica__cartell">
              {form.cartell
                ? <img className="pagina-publica__cartell-imatge" src={form.cartell} alt="Cartell" />
                : <p className="form__ajuda">Sense cartell.</p>}
              <label className="form__label" htmlFor="publica-cartell">Pujar cartell</label>
              <input
                id="publica-cartell"
                type="file"
                accept={ACCEPT_IMATGE}
                disabled={!potPujar}
                onChange={handleCartell}
              />
              {!esSlugValid(slug) && <p className="form__ajuda">{MOTIU_SENSE_SLUG}</p>}
            </div>

            <div className="pagina-publica__galeria">
              <ul className="pagina-publica__galeria-llista" aria-label="Galeria">
                {form.galeria.map((url, i) => (
                  <li key={url} className="pagina-publica__galeria-element">
                    <img className="pagina-publica__miniatura" src={url} alt={`Imatge ${i + 1} de la galeria`} />
                    <div className="pagina-publica__galeria-accions">
                      <button type="button" className="btn-icona" aria-label={`Moure amunt la imatge ${i + 1}`} disabled={i === 0} onClick={() => moure(i, i - 1)}>↑</button>
                      <button type="button" className="btn-icona" aria-label={`Moure avall la imatge ${i + 1}`} disabled={i === form.galeria.length - 1} onClick={() => moure(i, i + 1)}>↓</button>
                      <button type="button" className="btn-icona" aria-label={`Treure la imatge ${i + 1}`} onClick={() => onCanvi('galeria', form.galeria.filter((_, j) => j !== i))}>✕</button>
                    </div>
                  </li>
                ))}
              </ul>
              <label className="form__label" htmlFor="publica-galeria">Afegir imatges a la galeria</label>
              <input
                id="publica-galeria"
                type="file"
                accept={ACCEPT_IMATGE}
                multiple
                disabled={!potPujar}
                onChange={handleGaleria}
              />
              <p className="form__ajuda">
                {esSlugValid(slug) ? 'JPG, PNG o WebP, fins a 10 MB cada una.' : MOTIU_SENSE_SLUG}
              </p>
            </div>
          </div>

          <h3 className="pagina-publica__subtitol">Fitxa</h3>
          <div className="pagina-publica__graella">
            {FITXA.map(([camp, etiqueta, ajuda]) => <Camp key={camp} camp={camp} etiqueta={etiqueta} ajuda={ajuda} {...props} />)}
          </div>
          <Camp camp="sinopsiCartell" etiqueta="Sinopsi del cartell" {...props}>
            <textarea
              id="publica-sinopsiCartell"
              className="form__input"
              rows={4}
              value={form.sinopsiCartell}
              onChange={(e) => onCanvi('sinopsiCartell', e.target.value)}
            />
          </Camp>

          <h3 className="pagina-publica__subtitol">Sessió</h3>
          <div className="pagina-publica__graella">
            <Camp camp="versioTipus" etiqueta="Versió" {...props}>
              <select id="publica-versioTipus" className="form__input" value={form.versioTipus} onChange={(e) => onCanvi('versioTipus', e.target.value)}>
                {VERSIONS.map(([valor, nom]) => <option key={valor} value={valor}>{nom}</option>)}
              </select>
            </Camp>
            <Camp camp="seccio" etiqueta="Secció" {...props}>
              <select id="publica-seccio" className="form__input" value={form.seccio} onChange={(e) => onCanvi('seccio', e.target.value)}>
                {SECCIONS.map(([valor, nom]) => <option key={valor} value={valor}>{nom}</option>)}
              </select>
            </Camp>
            {GESTIO.map(([camp, etiqueta, ajuda]) => <Camp key={camp} camp={camp} etiqueta={etiqueta} ajuda={ajuda} {...props} />)}
          </div>

          <h3 className="pagina-publica__subtitol">Textos</h3>
          <Camp camp="descripcio" etiqueta="Descripció (SEO)" ajuda={`${form.descripcio.length}/160 caràcters`}
            avis={form.descripcio.trim().length > 160 ? AVIS_DESCRIPCIO : ''}
            {...props}
          />
          <Camp camp="hook" etiqueta="Ganxo" {...props} />
          <Camp camp="trailerYoutubeId" etiqueta="Tràiler de YouTube (URL o id)" {...props} />
          <Camp
            camp="cos"
            etiqueta="Textos editorials (Markdown)"
            ajuda="Apartats amb «## Sinopsi», «## Context», «## Curiositats» i «## Per què l'hem programat?»."
            {...props}
          >
            <textarea
              id="publica-cos"
              className="form__input pagina-publica__cos"
              rows={16}
              value={form.cos}
              onChange={(e) => onCanvi('cos', e.target.value)}
              aria-describedby="publica-cos-ajuda"
            />
          </Camp>
          {!form.cos.trim() && (
            <button type="button" className="btn btn--outline pagina-publica__boto-petit" onClick={() => onCanvi('cos', ESQUELET)}>
              Inserir l'esquelet
            </button>
          )}
        </div>
      )}
    </section>
  );
}
