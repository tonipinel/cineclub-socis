import { Link } from 'react-router-dom';

export default function BotoAfegir({ to, etiqueta, desactivat = false, compacte = false }) {
  const icona = (
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
  );

  const classe = compacte ? 'btn-icona' : 'btn-icona btn-icona--text';
  const contingut = compacte ? icona : (
    <>
      {icona}
      <span className="btn-icona__text">{etiqueta}</span>
    </>
  );

  if (desactivat) {
    return <button type="button" className={classe} aria-label={etiqueta} disabled>{contingut}</button>;
  }
  return <Link className={classe} to={to} aria-label={etiqueta}>{contingut}</Link>;
}
