import { Link } from 'react-router-dom';
import * as ROUTES from '../constants/routes';
import { formatEuros } from '../lib/moviments';
import { urlWeb } from '../lib/distribuidores';

export const INTERNA_BUIDA = { preu: '', condicions: '', distribuidoraId: '' };

// El preu i les condicions d'una pel·lícula són els seus si els té i, si no,
// els per defecte de la distribuïdora.
export function dadesEfectives(interna, distribuidora) {
  const propiPreu = interna.preu === '' ? null : Number(interna.preu);
  const propiesCondicions = interna.condicions.trim();
  return {
    preu: propiPreu ?? distribuidora?.preu ?? null,
    preuPerDefecte: propiPreu === null && distribuidora?.preu != null,
    condicions: propiesCondicions || distribuidora?.condicions || '',
    condicionsPerDefecte: !propiesCondicions && Boolean(distribuidora?.condicions),
  };
}

// Dades de gestió que només veu l'organització: no es desen a la proposta
// (que és pública) sinó a `propostesInternes`.
export function GestioInternaVista({ interna, distribuidores }) {
  const distribuidora = distribuidores.find((d) => d.id === interna.distribuidoraId);
  const efectives = dadesEfectives(interna, distribuidora);
  return (
    <section className="gestio-interna">
      <h2 className="gestio-interna__titol">
        Gestió interna <span className="gestio-interna__privat">Privat</span>
      </h2>
      <dl className="gestio-interna__dades">
        <dt className="fitxa-pellicula__etiqueta">Distribuïdora</dt>
        <dd className="fitxa-pellicula__valor">
          {distribuidora ? (
            <>
              <Link className="enllac" to={ROUTES.DISTRIBUIDORES_EDITAR.replace(':id', distribuidora.id)}>{distribuidora.nom}</Link>
              {distribuidora.web && (
                <> · <a className="enllac" href={urlWeb(distribuidora.web)} target="_blank" rel="noopener noreferrer">{distribuidora.web}</a></>
              )}
              {(distribuidora.contacte || distribuidora.correu) && (
                <span className="gestio-interna__contacte">
                  {distribuidora.contacte}
                  {distribuidora.contacte && distribuidora.correu && ' · '}
                  {distribuidora.correu && <a className="enllac" href={`mailto:${distribuidora.correu}`}>{distribuidora.correu}</a>}
                </span>
              )}
            </>
          ) : '—'}
        </dd>
        <dt className="fitxa-pellicula__etiqueta">Preu</dt>
        <dd className="fitxa-pellicula__valor">
          {efectives.preu === null ? '—' : formatEuros(efectives.preu)}
          {efectives.preuPerDefecte && <span className="gestio-interna__per-defecte"> (per defecte de la distribuïdora)</span>}
        </dd>
        <dt className="fitxa-pellicula__etiqueta">Condicions especials</dt>
        <dd className="fitxa-pellicula__valor gestio-interna__condicions">
          {efectives.condicions || '—'}
          {efectives.condicionsPerDefecte && <span className="gestio-interna__per-defecte"> (per defecte de la distribuïdora)</span>}
        </dd>
      </dl>
    </section>
  );
}

export function GestioInternaCamps({ interna, distribuidores, onChange }) {
  const distribuidora = distribuidores.find((d) => d.id === interna.distribuidoraId);
  return (
    <fieldset className="gestio-interna gestio-interna--formulari">
      <legend className="gestio-interna__titol">
        Gestió interna <span className="gestio-interna__privat">Privat: no es veu a la vista pública</span>
      </legend>
      <div className="form__field">
        <label className="form__label" htmlFor="distribuidoraId">Distribuïdora</label>
        <select id="distribuidoraId" className="form__input" value={interna.distribuidoraId} onChange={onChange('distribuidoraId')}>
          <option value="">Sense distribuïdora</option>
          {distribuidores.map((d) => <option key={d.id} value={d.id}>{d.nom}</option>)}
        </select>
        <Link className="enllac gestio-interna__afegir" to={ROUTES.DISTRIBUIDORES_NOVA}>Afegir una distribuïdora</Link>
      </div>
      <div className="form__field">
        <label className="form__label" htmlFor="preu">Preu (€)</label>
        <input
          id="preu"
          type="number"
          step="0.01"
          min="0"
          className="form__input"
          value={interna.preu}
          onChange={onChange('preu')}
          placeholder={distribuidora?.preu != null ? `${distribuidora.preu} (per defecte)` : ''}
        />
        {distribuidora?.preu != null && (
          <p className="gestio-interna__ajuda">En blanc: s'aplica el preu per defecte de {distribuidora.nom} ({formatEuros(distribuidora.preu)}).</p>
        )}
      </div>
      <div className="form__field">
        <label className="form__label" htmlFor="condicions">Condicions especials</label>
        <textarea
          id="condicions"
          className="form__input"
          rows={3}
          value={interna.condicions}
          onChange={onChange('condicions')}
          placeholder={distribuidora?.condicions ? `Per defecte: ${distribuidora.condicions}` : ''}
        />
        {distribuidora?.condicions && (
          <p className="gestio-interna__ajuda">En blanc: s'apliquen les condicions per defecte de {distribuidora.nom}.</p>
        )}
      </div>
    </fieldset>
  );
}
