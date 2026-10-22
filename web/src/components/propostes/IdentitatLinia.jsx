// «Identificat com: {nom} · Sortir»: sempre visible mentre hi ha una identitat (el dispositiu pot ser compartit).
// `sola` és per a fora de la franja de votació (llista, rànquing tancat, «sense votació»).
export default function IdentitatLinia({ identitat, setIdentitat, sola = false }) {
  return (
    <p className={`votacio__identitat ${sola ? 'votacio__identitat--sola' : ''}`}>
      Identificat com: <strong className="votacio__nom" title={identitat.nomPublic}>{identitat.nomPublic}</strong>
      <span aria-hidden="true"> · </span>
      <button
        type="button"
        className="votacio__enllac"
        aria-label={`Sortir: deixar de votar com a ${identitat.nomPublic}`}
        onClick={() => setIdentitat(null)}
      >
        Sortir
      </button>
    </p>
  );
}
