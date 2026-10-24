import { Link } from 'react-router-dom';
import * as ROUTES from '../../../constants/routes';
import { etiquetaSoci } from '../../../lib/socis';
import { formatEuros } from '../../../lib/moviments';
import TextareaAutomatic from '../../../components/TextareaAutomatic';
import ZonaPerill from '../../../components/ZonaPerill';
import { ESTATS } from '../campsProposta';

// Pestanya editable amb el proposant, l'estat, el comentari i les dades internes (privades).
// Canviar l'estat no programa res: només «Programar sessió» de la capçalera crea la sessió.
export default function GestioProposta({
  valors, canvia, errors, socis, distribuidores, internaDisponible, onEliminar, errorEliminar,
}) {
  const distribuidora = distribuidores.find((d) => d.id === valors.distribuidoraId);
  const alCanvi = (camp) => (e) => canvia(camp, e.target.value);

  return (
    <div className="fitxa-proposta__targetes">
      <section className="fitxa-proposta__targeta" aria-labelledby="gestio-proposta">
        <h2 className="fitxa-proposta__targeta-titol" id="gestio-proposta">Proposta</h2>
        <div className="fitxa-proposta__graella">
          <div className="form__field">
            <label className="form__label" htmlFor="soci">Soci</label>
            <input
              id="soci"
              list="fitxa-proposta-socis"
              className="form__input"
              value={valors.soci}
              onChange={alCanvi('soci')}
              aria-invalid={Boolean(errors.soci)}
              aria-describedby={errors.soci ? 'soci-error' : undefined}
            />
            <datalist id="fitxa-proposta-socis">
              {socis.map((s) => <option key={s.id} value={etiquetaSoci(s)} />)}
            </datalist>
            {errors.soci && <p id="soci-error" className="form__error">{errors.soci}</p>}
          </div>
          <div className="form__field">
            <label className="form__label" htmlFor="estat">Estat</label>
            <select id="estat" className="form__input" value={valors.estat} onChange={alCanvi('estat')}>
              {ESTATS.map(([valor, etiqueta]) => <option key={valor} value={valor}>{etiqueta}</option>)}
            </select>
          </div>
        </div>
        <div className="form__field">
          <label className="form__label" htmlFor="comentari">Comentari del soci</label>
          <TextareaAutomatic id="comentari" mida="curt" value={valors.comentari} onChange={alCanvi('comentari')} />
        </div>
      </section>

      <fieldset className="fitxa-proposta__targeta fitxa-proposta__targeta--privada" disabled={!internaDisponible}>
        <legend className="fitxa-proposta__llegenda">
          Gestió interna <span className="fitxa-proposta__privat">Privat: no es veu a la vista pública</span>
        </legend>
        {!internaDisponible && (
          <p className="fitxa-proposta__avis">No s&apos;han pogut carregar les dades internes: no es poden editar ara.</p>
        )}
        <div className="fitxa-proposta__graella">
          <div className="form__field">
            <label className="form__label" htmlFor="distribuidoraId">Distribuïdora</label>
            <select id="distribuidoraId" className="form__input" value={valors.distribuidoraId} onChange={alCanvi('distribuidoraId')}>
              <option value="">Sense distribuïdora</option>
              {distribuidores.map((d) => <option key={d.id} value={d.id}>{d.nom}</option>)}
            </select>
            <Link className="enllac fitxa-proposta__afegir" to={ROUTES.DISTRIBUIDORES_NOVA}>Afegir una distribuïdora</Link>
          </div>
          <div className="form__field">
            <label className="form__label" htmlFor="preu">Preu (€)</label>
            <input
              id="preu"
              type="number"
              step="0.01"
              min="0"
              className="form__input"
              value={valors.preu}
              onChange={alCanvi('preu')}
              placeholder={distribuidora?.preu != null ? `${distribuidora.preu} (per defecte)` : ''}
              aria-describedby={distribuidora?.preu != null ? 'preu-ajuda' : undefined}
            />
            {distribuidora?.preu != null && (
              <p id="preu-ajuda" className="fitxa-proposta__ajuda">
                En blanc: s&apos;aplica el preu per defecte de {distribuidora.nom} ({formatEuros(distribuidora.preu)}).
              </p>
            )}
          </div>
        </div>
        <div className="form__field">
          <label className="form__label" htmlFor="condicions">Condicions especials</label>
          <TextareaAutomatic
            id="condicions"
            mida="curt"
            value={valors.condicions}
            onChange={alCanvi('condicions')}
            placeholder={distribuidora?.condicions ? `Per defecte: ${distribuidora.condicions}` : ''}
            aria-describedby={distribuidora?.condicions ? 'condicions-ajuda' : undefined}
          />
          {distribuidora?.condicions && (
            <p id="condicions-ajuda" className="fitxa-proposta__ajuda">
              En blanc: s&apos;apliquen les condicions per defecte de {distribuidora.nom}.
            </p>
          )}
        </div>
      </fieldset>

      <ZonaPerill descripcio="S'esborren la proposta i les seves dades internes. Aquesta acció no es pot desfer.">
        <button className="btn btn--perill" type="button" onClick={onEliminar}>Eliminar proposta</button>
        {errorEliminar && <p className="form__error" role="alert">{errorEliminar}</p>}
      </ZonaPerill>
    </div>
  );
}
