import { formatEuros } from '../../../lib/moviments';
import TextareaAutomatic from '../../../components/TextareaAutomatic';

// Gestió interna (privada) de la pel·lícula: són les mateixes dades que a la fitxa de la proposta d'origen
// (`propostesInternes/{propostaId}`), menys la distribuïdora, que és la de la sessió. S'editen aquí i es desen amb el «Desar» de la sessió.
export default function GestioInternaSessio({ interna, onCanviInterna, distribuidora }) {
  const alCanvi = (camp) => (e) => onCanviInterna(camp, e.target.value);

  return (
    <section className="fitxa-sessio__targeta fitxa-sessio__targeta--privada" aria-labelledby="targeta-gestio-interna">
      <h2 className="fitxa-sessio__targeta-titol" id="targeta-gestio-interna">
        Gestió interna <span className="fitxa-sessio__privat">Privat: no es veu a la vista pública</span>
      </h2>
      <div className="fitxa-sessio__graella">
        <div className="form__field">
          <label className="form__label" htmlFor="interna-preu">Preu (€)</label>
          <input
            id="interna-preu"
            type="number"
            step="0.01"
            min="0"
            className="form__input"
            value={interna.preu}
            onChange={alCanvi('preu')}
            placeholder={distribuidora?.preu != null ? `${distribuidora.preu} (per defecte)` : ''}
          />
          {distribuidora?.preu != null && (
            <p className="fitxa-sessio__ajuda">
              En blanc: s&apos;aplica el preu per defecte de {distribuidora.nom} ({formatEuros(distribuidora.preu)}).
            </p>
          )}
        </div>
      </div>
      <div className="form__field">
        <label className="form__label" htmlFor="interna-condicions">Condicions especials</label>
        <TextareaAutomatic
          id="interna-condicions"
          mida="curt"
          value={interna.condicions}
          onChange={alCanvi('condicions')}
          placeholder={distribuidora?.condicions ? `Per defecte: ${distribuidora.condicions}` : ''}
        />
        {distribuidora?.condicions && (
          <p className="fitxa-sessio__ajuda">En blanc: s&apos;apliquen les condicions per defecte de {distribuidora.nom}.</p>
        )}
      </div>
    </section>
  );
}
