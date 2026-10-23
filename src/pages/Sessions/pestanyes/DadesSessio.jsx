import { generarSlug, slugDisponible, validarPublicable } from '../../../lib/sessioPublica';
import { FITXA, GESTIO, SECCIONS, VERSIONS } from '../camps';
import Camp from './Camp';

const CAMPS_SESSIO = [
  ['titol', 'Títol', 'text'],
  ['data', 'Data', 'date'],
  ['hora', "Hora d'inici", 'time'],
];

const CAMPS_AVANCAT = [
  ['urlProgramacio', 'URL de programació', 'text'],
  ['imatgeUrl', 'URL de la imatge de reserva (si no hi ha cartell públic)', 'text'],
];

function CampsSessio({ camps, dades, onCanviDades }) {
  return camps.map(([camp, etiqueta, tipus]) => (
    <div className="form__field" key={camp}>
      <label className="form__label" htmlFor={camp}>{etiqueta}</label>
      <input
        id={camp}
        type={tipus}
        className="form__input"
        value={dades[camp] ?? ''}
        onChange={(e) => onCanviDades(camp, e.target.value)}
      />
    </div>
  ));
}

export function TargetaSessio({ dades, onCanviDades }) {
  return (
    <section className="fitxa-sessio__targeta" aria-labelledby="targeta-sessio">
      <h2 className="fitxa-sessio__targeta-titol" id="targeta-sessio">Sessió</h2>
      <div className="fitxa-sessio__graella">
        <CampsSessio camps={CAMPS_SESSIO} dades={dades} onCanviDades={onCanviDades} />
      </div>
    </section>
  );
}

export default function DadesSessio({
  dades, onCanviDades, form, onCanviForm, errors, altresSessions, urlPagina,
}) {
  const slug = dades.slug ?? '';
  const any = typeof dades.data === 'string' ? dades.data.slice(0, 4) : '';
  const suggeriment = generarSlug(form.titol || dades.titol);
  const slugRepetit = slug && !slugDisponible(slug, dades.data, altresSessions, dades.id);
  const { avisos } = validarPublicable({ ...dades, publica: { cartell: form.cartell } }, altresSessions);
  const errorsPublicar = ['titol', 'data', 'slug'].filter((camp) => errors.publicar?.[camp]);
  const props = { form, onCanviForm, errors };

  return (
    <div className="fitxa-sessio__targetes">
      <TargetaSessio dades={dades} onCanviDades={onCanviDades} />

      <section className="fitxa-sessio__targeta" aria-labelledby="targeta-publicacio">
        <h2 className="fitxa-sessio__targeta-titol" id="targeta-publicacio">Publicació</h2>
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
              checked={Boolean(dades.publicada)}
              onChange={(e) => onCanviDades('publicada', e.target.checked)}
            />
            Publicada
          </label>
          {urlPagina && (
            <a className="enllac fitxa-sessio__url" href={urlPagina} target="_blank" rel="noopener noreferrer">{urlPagina}</a>
          )}
        </div>
        {dades.publicada && avisos.cartell && (
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
            onChange={(e) => onCanviDades('slug', e.target.value.trim())}
            aria-describedby="publica-slug-ajuda"
          />
          <p id="publica-slug-ajuda" className="form__ajuda">
            {any && slug ? `URL: /programacio/${any}/${slug}/` : 'Minúscules, xifres i guions. Forma part de la URL.'}
          </p>
          {!slug && suggeriment && (
            <button type="button" className="btn btn--outline pagina-publica__boto-petit" onClick={() => onCanviDades('slug', suggeriment)}>
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
      </section>

      <section className="fitxa-sessio__targeta" aria-labelledby="targeta-pellicula">
        <h2 className="fitxa-sessio__targeta-titol" id="targeta-pellicula">Pel·lícula</h2>
        <div className="fitxa-sessio__graella">
          {FITXA.map(([camp, etiqueta, ajuda]) => <Camp key={camp} camp={camp} etiqueta={etiqueta} ajuda={ajuda} {...props} />)}
        </div>
      </section>

      <section className="fitxa-sessio__targeta" aria-labelledby="targeta-entrada">
        <h2 className="fitxa-sessio__targeta-titol" id="targeta-entrada">Entrada i organització</h2>
        <div className="fitxa-sessio__graella">
          <Camp camp="versioTipus" etiqueta="Versió" {...props}>
            <select id="publica-versioTipus" className="form__input" value={form.versioTipus} onChange={(e) => onCanviForm('versioTipus', e.target.value)}>
              {VERSIONS.map(([valor, nom]) => <option key={valor} value={valor}>{nom}</option>)}
            </select>
          </Camp>
          <Camp camp="seccio" etiqueta="Secció" {...props}>
            <select id="publica-seccio" className="form__input" value={form.seccio} onChange={(e) => onCanviForm('seccio', e.target.value)}>
              {SECCIONS.map(([valor, nom]) => <option key={valor} value={valor}>{nom}</option>)}
            </select>
          </Camp>
          {GESTIO.map(([camp, etiqueta, ajuda]) => <Camp key={camp} camp={camp} etiqueta={etiqueta} ajuda={ajuda} {...props} />)}
        </div>
      </section>

      <section className="fitxa-sessio__targeta" aria-labelledby="targeta-avancat">
        <h2 className="fitxa-sessio__targeta-titol" id="targeta-avancat">Avançat</h2>
        <CampsSessio camps={CAMPS_AVANCAT} dades={dades} onCanviDades={onCanviDades} />
      </section>
    </div>
  );
}
