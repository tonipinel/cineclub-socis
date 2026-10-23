import { useRef, useState } from 'react';
import { nomAlCataleg } from '../lib/entitats';

// Selecció múltiple d'entitats del catàleg, en ordre de selecció. Els noms que no són al catàleg es conserven.
export default function SelectorEntitats({
  etiqueta, valor, onCanvi, entitats, id, ajuda,
}) {
  const [triada, setTriada] = useState('');
  const select = useRef(null);
  const noms = entitats.map((e) => e.nom);
  const delCataleg = valor.map((nom) => nomAlCataleg(nom, noms));
  const disponibles = entitats.filter((e) => !delCataleg.includes(e.nom));
  const actual = disponibles.some((e) => e.nom === triada) ? triada : '';
  const idEtiqueta = `${id}-etiqueta`;
  const idAjuda = ajuda ? `${id}-ajuda` : undefined;

  const canviar = (noms) => {
    onCanvi(noms);
    setTriada('');
    select.current?.focus();
  };

  return (
    <fieldset className="form__field selector-entitats">
      <legend className="form__label selector-entitats__etiqueta" id={idEtiqueta}>{etiqueta}</legend>
      {valor.length > 0 && (
        <ul className="selector-entitats__xips" aria-label={`${etiqueta} seleccionades`}>
          {valor.map((nom, i) => (
            <li className="selector-entitats__xip" key={`${nom}-${i}`}>
              <span className="selector-entitats__nom">
                {delCataleg[i] ?? nom}
                {!delCataleg[i] && <span className="selector-entitats__avis"> — no és al catàleg</span>}
              </span>
              <button
                type="button"
                className="selector-entitats__treure"
                aria-label={`Treure ${delCataleg[i] ?? nom}`}
                onClick={() => canviar(valor.filter((_, j) => j !== i))}
              >
                <svg className="selector-entitats__icona" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="selector-entitats__afegir">
        <select
          id={id}
          ref={select}
          className="form__input selector-entitats__select"
          value={actual}
          onChange={(e) => setTriada(e.target.value)}
          aria-labelledby={idEtiqueta}
          aria-describedby={idAjuda}
        >
          <option value="">— Tria una entitat —</option>
          {disponibles.map((e) => <option key={e.id} value={e.nom}>{e.nom}</option>)}
        </select>
        <button type="button" className="btn btn--outline selector-entitats__boto" disabled={!actual} onClick={() => canviar([...valor, actual])}>
          Afegir
        </button>
      </div>
      {ajuda && <p id={idAjuda} className="form__ajuda">{ajuda}</p>}
    </fieldset>
  );
}
