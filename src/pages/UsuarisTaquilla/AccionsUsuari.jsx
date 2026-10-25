// Botons d'acció d'un usuari de taquilla (llistat i fitxa). `ambEliminar`: al llistat; a la fitxa és a la zona de perill.
export default function AccionsUsuari({
  usuari, accions, ambEliminar = false, desactivat = false,
}) {
  const bloquejat = desactivat || accions.ocupat !== null;
  const nom = usuari.nom || usuari.correu;
  return (
    <div className="usuaris-taquilla__accions">
      <button
        type="button"
        className="btn btn--outline usuaris-taquilla__boto"
        disabled={bloquejat}
        aria-label={`${usuari.desactivat ? 'Reactiva' : 'Desactiva'} ${nom}`}
        onClick={() => accions.alternaEstat(usuari)}
      >
        {usuari.desactivat ? 'Reactiva' : 'Desactiva'}
      </button>
      <button
        type="button"
        className="btn btn--outline usuaris-taquilla__boto"
        disabled={bloquejat || usuari.desactivat}
        aria-label={`Restableix la contrasenya de ${nom}`}
        onClick={() => accions.restableix(usuari)}
      >
        Restableix la contrasenya
      </button>
      {ambEliminar && (
        <button
          type="button"
          className="btn btn--perill usuaris-taquilla__boto"
          disabled={bloquejat}
          aria-label={`Elimina ${nom}`}
          onClick={() => accions.elimina(usuari)}
        >
          Elimina
        </button>
      )}
    </div>
  );
}
