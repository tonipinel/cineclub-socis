import { useState } from 'react';
import { ACCEPT_IMATGE } from '../../../lib/sessioPublica';

const TEXT_ESTAT = { pujant: 'pujant…', ok: 'pujada' };

// Zona on deixar anar fitxers (HTML5 natiu) amb el selector de fitxers de reserva i l'estat de cada fitxer.
export default function ZonaPujada({
  id, etiqueta, habilitada, motiuDeshabilitada, multiple = false, onFitxers, estats = [],
}) {
  const [activa, setActiva] = useState(false);

  const passar = (llista) => {
    const fitxers = [...llista];
    if (fitxers.length) onFitxers(multiple ? fitxers : fitxers.slice(0, 1));
  };

  const onDragOver = (e) => {
    e.preventDefault();
    if (!habilitada) return;
    e.dataTransfer.dropEffect = 'copy';
    setActiva(true);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setActiva(false);
    if (habilitada) passar(e.dataTransfer.files);
  };

  const onChange = (e) => {
    const fitxers = e.target.files;
    passar(fitxers);
    e.target.value = '';
  };

  const classe = ['zona-pujada', activa && 'zona-pujada--activa', !habilitada && 'zona-pujada--deshabilitada']
    .filter(Boolean).join(' ');

  return (
    <div className="zona-pujada__contenidor">
      <div className={classe} onDragOver={onDragOver} onDragLeave={() => setActiva(false)} onDrop={onDrop}>
        <label className="zona-pujada__etiqueta" htmlFor={id}>{etiqueta}</label>
        <p className="zona-pujada__text">{multiple ? 'Arrossega-hi les imatges o tria-les:' : 'Arrossega-hi la imatge o tria-la:'}</p>
        <input
          id={id}
          className="zona-pujada__input"
          type="file"
          accept={ACCEPT_IMATGE}
          multiple={multiple}
          disabled={!habilitada}
          onChange={onChange}
        />
        <p className="form__ajuda">{habilitada || !motiuDeshabilitada ? 'JPG, PNG o WebP, fins a 10 MB cada una.' : motiuDeshabilitada}</p>
      </div>
      {estats.length > 0 && (
        <ul className="zona-pujada__estats" role="status">
          {estats.map(({ nom, estat, missatge }, i) => (
            estat === 'error' ? (
              <li key={i} className="zona-pujada__estat zona-pujada__estat--error" role="alert">{`${nom}: ${missatge ?? "No s'ha pogut pujar."}`}</li>
            ) : (
              <li key={i} className={`zona-pujada__estat zona-pujada__estat--${estat}`}>{`${nom}: ${TEXT_ESTAT[estat]}`}</li>
            )
          ))}
        </ul>
      )}
    </div>
  );
}
