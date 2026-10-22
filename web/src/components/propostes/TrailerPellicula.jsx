import { useState } from 'react';

function idYoutube(url) {
  try {
    const adreca = new URL(url);
    if (adreca.hostname === 'youtu.be') return adreca.pathname.slice(1) || null;
    if (adreca.hostname.endsWith('youtube.com')) {
      if (adreca.pathname === '/watch') return adreca.searchParams.get('v');
      return adreca.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1] ?? null;
    }
  } catch {
    // URL mal escrita: es tracta com un enllaç qualsevol.
  }
  return null;
}

// Tràiler de la pel·lícula: una miniatura gran amb un botó de play que, en
// clicar-lo, carrega el vídeo allà mateix. Fins aleshores no es carrega res
// de YouTube. Si l'enllaç no és de YouTube, es mostra com un botó.
export default function TrailerPellicula({ url, titol }) {
  const [reproduint, setReproduint] = useState(false);
  const id = idYoutube(url);

  if (!id) {
    return (
      <a className="btn trailer-pellicula__enllac" href={url} target="_blank" rel="noopener noreferrer">
        Veure tràiler
      </a>
    );
  }

  return (
    <div className="trailer-pellicula">
      {reproduint ? (
        <iframe
          className="trailer-pellicula__video"
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
          title={`Tràiler de ${titol}`}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      ) : (
        <button
          type="button"
          className="trailer-pellicula__play"
          onClick={() => setReproduint(true)}
          aria-label={`Veure el tràiler de ${titol}`}
        >
          <img className="trailer-pellicula__miniatura" src={`https://img.youtube.com/vi/${id}/hqdefault.jpg`} alt="" />
          <span className="trailer-pellicula__boto" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="trailer-pellicula__icona">
              <path d="M8 5.5v13l11-6.5-11-6.5Z" fill="currentColor" />
            </svg>
          </span>
          <span className="trailer-pellicula__etiqueta">Tràiler</span>
        </button>
      )}
    </div>
  );
}
