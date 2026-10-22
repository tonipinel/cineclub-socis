export default function BarraProgres({ votats, total }) {
  const percentatge = total ? Math.min(100, Math.max(0, Math.round((votats / total) * 100))) : 0;
  const completa = total > 0 && votats >= total;
  return (
    <div className={`barra-progres ${completa ? 'barra-progres--completa' : ''}`}>
      <div
        className="barra-progres__pista"
        role="progressbar"
        aria-label="Progrés de la votació"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percentatge}
      >
        <div className="barra-progres__ple" style={{ width: `${percentatge}%` }} />
      </div>
      <p className="barra-progres__text" aria-live="polite">Has votat {votats} de {total}</p>
    </div>
  );
}
