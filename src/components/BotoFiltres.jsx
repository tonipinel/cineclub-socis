export default function BotoFiltres({ obert, onClick }) {
  return (
    <button
      type="button"
      className={`btn-icona btn-icona--filtres ${obert ? 'btn-icona--actiu' : ''}`}
      aria-label={obert ? 'Amagar filtres' : 'Mostrar filtres'}
      aria-expanded={obert}
      onClick={onClick}
    >
      <svg
        className="btn-icona__icona"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 5h16l-6 7v6l-4 2v-8Z" />
      </svg>
    </button>
  );
}
