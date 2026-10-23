import { useId } from 'react';
import { formatEuros } from '../lib/moviments';

// Tota la targeta és l'etiqueta de la casella; el nom accessible és només el títol i la resta n'és la descripció.
export default function CartaPropostaTanda({
  proposta, distribuidora, preu, preuPerDefecte, seleccionada, desactivada, onAlterna,
}) {
  const id = useId();
  const cartell = proposta.imatgeUrl;
  const classes = [
    'carta-proposta-tanda',
    seleccionada && 'carta-proposta-tanda--seleccionada',
    desactivada && 'carta-proposta-tanda--desactivada',
  ].filter(Boolean).join(' ');

  return (
    <label className={classes}>
      {cartell
        ? <img className="carta-proposta-tanda__cartell" src={cartell} alt="" loading="lazy" />
        : <span className="carta-proposta-tanda__cartell carta-proposta-tanda__cartell--buit" aria-hidden="true" />}
      <span className="carta-proposta-tanda__dades">
        <span className="carta-proposta-tanda__capcalera">
          <input
            type="checkbox"
            className="carta-proposta-tanda__casella"
            checked={seleccionada}
            disabled={desactivada}
            onChange={onAlterna}
            aria-labelledby={`${id}-titol`}
            aria-describedby={`${id}-context`}
          />
          <span id={`${id}-titol`} className="carta-proposta-tanda__titol">{proposta.titol}</span>
        </span>
        <span id={`${id}-context`} className="carta-proposta-tanda__context">
          {proposta.nomProposant && (
            <span className="carta-proposta-tanda__proposant">Proposat per {proposta.nomProposant}</span>
          )}
          {distribuidora && <span className="carta-proposta-tanda__distribuidora">{distribuidora.nom}</span>}
          {preu !== null && preu !== undefined && (
            <span className="carta-proposta-tanda__preu">
              {formatEuros(preu)}
              {preuPerDefecte && <span title="Preu per defecte de la distribuïdora"> *</span>}
            </span>
          )}
        </span>
      </span>
    </label>
  );
}
