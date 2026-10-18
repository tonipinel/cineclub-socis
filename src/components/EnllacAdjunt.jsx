import { urlAdjunt } from '../lib/adjunts';

// Obre el document en una finestra nova. La URL de descàrrega s'obté en
// clicar (no per cada fila del llistat), així que la finestra s'obre abans,
// de forma síncrona, perquè el navegador no la bloquegi com a pop-up.
export default function EnllacAdjunt({ adjunt }) {
  const handleClick = (e) => {
    e.stopPropagation();
    const finestra = window.open('', '_blank');
    urlAdjunt(adjunt.path)
      .then((url) => { finestra.location.href = url; })
      .catch(() => finestra.close());
  };

  const esPdf = adjunt.nom.toLowerCase().endsWith('.pdf');

  return (
    <button
      type="button"
      className="comptabilitat__adjunt"
      aria-label={`Veure el document ${adjunt.nom}`}
      title={adjunt.nom}
      onClick={handleClick}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <svg
        className="comptabilitat__adjunt-icona"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
        <path d="M14 2v6h6" />
        {esPdf && <text x="12" y="17" textAnchor="middle" fontSize="6" fontWeight="700" fill="currentColor" stroke="none">PDF</text>}
      </svg>
    </button>
  );
}
