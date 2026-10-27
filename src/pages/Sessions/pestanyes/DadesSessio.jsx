import { Link } from 'react-router-dom';
import { generarSlug, slugDisponible, validarPublicable } from '../../../lib/sessioPublica';
import { llistaDeText, nomAlCataleg, textDeLlista } from '../../../lib/entitats';
import { opcionsDistribucio } from '../../../lib/distribuidores';
import * as ROUTES from '../../../constants/routes';
import SelectorEntitats from '../../../components/SelectorEntitats';
import { FITXA, GESTIO, SECCIONS, VERSIONS } from '../camps';
import Camp from './Camp';
import GestioInternaSessio from './GestioInternaSessio';

const CAMPS_SESSIO = [
  ['titol', 'Títol original', 'text', "En l'idioma de la pel·lícula. És el títol principal de la web i de l'admin."],
  ['data', 'Data', 'date'],
  ['hora', "Hora d'inici", 'time'],
];

const CAMPS_AVANCAT = [
  ['imatgeUrl', 'URL de la imatge de reserva (si no hi ha cartell públic)', 'text'],
];

function CampsSessio({ camps, dades, onCanviDades, avisos = {} }) {
  return camps.map(([camp, etiqueta, tipus, ajuda]) => (
    <div className="form__field" key={camp}>
      <label className="form__label" htmlFor={camp}>{etiqueta}</label>
      <input
        id={camp}
        type={tipus}
        className="form__input"
        value={dades[camp] ?? ''}
        onChange={(e) => onCanviDades(camp, e.target.value)}
        aria-describedby={ajuda ? `${camp}-ajuda` : undefined}
      />
      {ajuda && <p id={`${camp}-ajuda`} className="form__ajuda">{ajuda}</p>}
      {avisos[camp] && <p className="pagina-publica__avis">{avisos[camp]}</p>}
    </div>
  ));
}

const normal = (t) => (typeof t === 'string' ? t.trim().toLowerCase() : '');

// `titolOriginalDesat`: el `publica.titolOriginal` desat. Si és diferent del títol (una sessió sense migrar), avisa
// abans que en desar se substitueixi.
export function TargetaSessio({ dades, onCanviDades, titolOriginalDesat = '' }) {
  const avisos = normal(titolOriginalDesat) && normal(titolOriginalDesat) !== normal(dades.titol)
    ? { titol: `La fitxa pública té desat un altre títol original: «${titolOriginalDesat}». En desar, s'hi escriurà el d'aquest camp.` }
    : {};
  return (
    <section className="fitxa-sessio__targeta" aria-labelledby="targeta-sessio">
      <h2 className="fitxa-sessio__targeta-titol" id="targeta-sessio">Sessió</h2>
      <div className="fitxa-sessio__graella">
        <CampsSessio camps={CAMPS_SESSIO} dades={dades} onCanviDades={onCanviDades} avisos={avisos} />
      </div>
    </section>
  );
}

export default function DadesSessio({
  dades, onCanviDades, form, onCanviForm, errors, altresSessions, urlPagina, entitats = [], organitzaDesat = '',
  distribuidores = [], distribucioDesada = { nom: '', id: '' }, original = {}, interna = null, onCanviInterna,
}) {
  const slug = dades.slug ?? '';
  const any = typeof dades.data === 'string' ? dades.data.slice(0, 4) : '';
  const suggeriment = generarSlug(dades.titol);
  const slugRepetit = slug && !slugDisponible(slug, dades.data, altresSessions, dades.id);
  const { avisos } = validarPublicable({ ...dades, publica: { cartell: form.cartell } }, altresSessions);
  const errorsPublicar = ['titol', 'data', 'slug'].filter((camp) => errors.publicar?.[camp]);
  const props = { form, onCanviForm, errors };
  // «Organitza»: el valor actual i el desat es poden triar encara que no siguin al catàleg (mai es reescriuen).
  // Si un d'ells és l'àlies d'una entitat (p. ex. «cineclub»), ocupa l'opció d'aquella entitat amb el seu nom.
  const nomsCataleg = entitats.map((e) => e.nom);
  const valorsOrganitza = [...new Set([form.organitza, organitzaDesat].filter(Boolean))];
  const foraCataleg = valorsOrganitza.filter((v) => !nomAlCataleg(v, nomsCataleg));
  const alies = Object.fromEntries(valorsOrganitza
    .filter((v) => !nomsCataleg.includes(v) && nomAlCataleg(v, nomsCataleg))
    .map((v) => [nomAlCataleg(v, nomsCataleg), v]));
  // «Suport de distribució»: el valor és l'id; triar-ne una escriu el nom i l'id i res més (sense àlies).
  const distribucio = opcionsDistribucio(
    distribuidores,
    { nom: form.suportDistribucio, id: form.suportDistribucioId },
    distribucioDesada,
  );
  const triarDistribucio = (valor) => {
    const { nom, id } = distribucio.opcions.find((o) => o.valor === valor);
    onCanviForm('suportDistribucio', nom);
    onCanviForm('suportDistribucioId', id);
  };
  const selector = (camp, etiqueta) => (
    <SelectorEntitats
      id={`publica-${camp}`}
      etiqueta={etiqueta}
      valor={llistaDeText(form[camp])}
      onCanvi={(noms) => onCanviForm(camp, textDeLlista(noms))}
      entitats={entitats}
    />
  );

  return (
    <div className="fitxa-sessio__targetes">
      <TargetaSessio dades={dades} onCanviDades={onCanviDades} titolOriginalDesat={original.publica?.titolOriginal} />

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
          <Camp camp="suportDistribucio" etiqueta="Suport de distribució" {...props}>
            <select
              id="publica-suportDistribucio"
              className="form__input"
              value={distribucio.valor}
              onChange={(e) => triarDistribucio(e.target.value)}
            >
              {distribucio.opcions.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
            </select>
          </Camp>
          <Camp camp="organitza" etiqueta="Organitza" {...props}>
            <select id="publica-organitza" className="form__input" value={form.organitza} onChange={(e) => onCanviForm('organitza', e.target.value)}>
              <option value="">—</option>
              {foraCataleg.map((v) => <option key={v} value={v}>{v} (no és al catàleg)</option>)}
              {entitats.map((e) => <option key={e.id} value={alies[e.nom] ?? e.nom}>{e.nom}</option>)}
            </select>
          </Camp>
          {selector('participa', 'Participen')}
          {selector('collabora', 'Col·laboren')}
        </div>
        <div className="selector-entitats__enllacos">
          <Link className="enllac selector-entitats__gestionar" to={ROUTES.ENTITATS}>Gestionar entitats</Link>
          <Link className="enllac selector-entitats__gestionar" to={ROUTES.DISTRIBUIDORES}>Gestionar distribuïdores</Link>
        </div>
      </section>

      {interna && <GestioInternaSessio interna={interna} onCanviInterna={onCanviInterna} distribuidores={distribuidores} />}

      <section className="fitxa-sessio__targeta" aria-labelledby="targeta-avancat">
        <h2 className="fitxa-sessio__targeta-titol" id="targeta-avancat">Avançat</h2>
        <CampsSessio camps={CAMPS_AVANCAT} dades={dades} onCanviDades={onCanviDades} />
      </section>
    </div>
  );
}
