import { Link } from 'react-router-dom';

export default function BotoAfegir({ to, etiqueta }) {
  return (
    <Link className="btn-icona" to={to} aria-label={etiqueta}>
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
        <path d="M12 5v14M5 12h14" />
      </svg>
    </Link>
  );
}
