import { useState } from 'react';
import { avui, formatData } from '../../lib/data';

const normalitza = (text) => String(text ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const titolDe = (s) => s.publica?.titol || s.titol;
const quan = (s) => `${formatData(s.data)}${s.hora && s.hora !== '00:00' ? ` · ${s.hora}` : ''}`;

function Fila({
  sessio, mode, triada, desactivada, onAlterna,
}) {
  const cartell = sessio.publica?.cartell;
  return (
    <li className={`social-sessio${triada ? ' social-sessio--triada' : ''}`}>
      <label className="social-sessio__casella">
        <input
          type={mode === 'una' ? 'radio' : 'checkbox'}
          name={mode === 'una' ? 'social-sessio' : undefined}
          className="social-sessio__check"
          checked={triada}
          disabled={desactivada}
          onChange={() => onAlterna(sessio.id)}
        />
        {cartell
          ? <img className="social-sessio__miniatura" src={cartell} alt="" loading="lazy" />
          : <span className="social-sessio__miniatura social-sessio__miniatura--buida" aria-hidden="true" />}
        <span className="social-sessio__text">
          <span className="social-sessio__data">{quan(sessio)}</span>
          <span className="social-sessio__titol">{titolDe(sessio)}</span>
        </span>
      </label>
    </li>
  );
}

// Llista de sessions amb cartell, data i títol (com la dels flyers), amb cerca. `sessions` van ordenades per data ascendent.
// mode «una»: radios (una sessió); mode «multiple»: caselles fins a `max`.
export default function TriaSessions({
  sessions, mode, triades, onAlterna, max = Infinity, nomesProperes = false, desactivat = false,
}) {
  const [cerca, setCerca] = useState('');
  const dataAvui = avui();
  const consulta = normalitza(cerca);
  const visibles = sessions
    .filter((s) => !nomesProperes || s.data >= dataAvui)
    .filter((s) => !consulta || normalitza(`${titolDe(s)} ${formatData(s.data)}`).includes(consulta));
  const properes = visibles.filter((s) => s.data >= dataAvui);
  const anteriors = visibles.filter((s) => s.data < dataAvui).reverse();

  const llista = (grup) => (
    <ul className="social-sessions__llista">
      {grup.map((s) => {
        const triada = triades.includes(s.id);
        return (
          <Fila
            key={s.id}
            sessio={s}
            mode={mode}
            triada={triada}
            desactivada={desactivat || (mode === 'multiple' && !triada && triades.length >= max)}
            onAlterna={onAlterna}
          />
        );
      })}
    </ul>
  );

  return (
    <div className="social-sessions">
      <input
        type="search"
        className="form__input"
        aria-label="Cerca una sessió"
        placeholder="Cerca per títol o data"
        value={cerca}
        onChange={(e) => setCerca(e.target.value)}
      />
      <div className="social-sessions__scroll">
        {visibles.length === 0 && (
          <p className="social-media__buit">{consulta ? 'Cap sessió coincideix amb la cerca.' : 'No hi ha cap sessió propera.'}</p>
        )}
        {properes.length > 0 && (
          <>
            {!nomesProperes && <h3 className="social-sessions__grup">Properes</h3>}
            {llista(properes)}
          </>
        )}
        {anteriors.length > 0 && (
          <>
            <h3 className="social-sessions__grup">Anteriors</h3>
            {llista(anteriors)}
          </>
        )}
      </div>
    </div>
  );
}
