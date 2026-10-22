export default function IconaPolze({ omplert, className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill={omplert ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3Zm0 0 4.5-7.5a1.5 1.5 0 0 1 2.7.9L13.5 9H19a2 2 0 0 1 1.9 2.7l-2.3 6.5A2 2 0 0 1 16.7 20H7" />
    </svg>
  );
}
