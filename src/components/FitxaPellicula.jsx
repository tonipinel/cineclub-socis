function Dada({ etiqueta, children }) {
  if (!children || (Array.isArray(children) && children.length === 0)) return null;
  return (
    <>
      <dt className="fitxa-pellicula__etiqueta">{etiqueta}</dt>
      <dd className="fitxa-pellicula__valor">{children}</dd>
    </>
  );
}

// Fitxa d'una pel·lícula amb les dades que ha desat TMDB a la proposta, amb
// el mateix estil que la fitxa de les sessions del lloc principal (etiquetes
// daurades en majúscules + valor). Es fa servir al detall públic i a la
// pantalla d'admin; aquesta última dibuixa el títol pel seu compte.
// `ambBasics` amaga any, durada, país i gènere quan ja es mostren a part.
export default function FitxaPellicula({ proposta, ambTitol = true, ambBasics = true }) {
  const repartiment = (proposta.repartiment ?? [])
    .map((a) => (a.personatge ? `${a.nom} (${a.personatge})` : a.nom))
    .join(', ');
  return (
    <div className="fitxa-pellicula">
      {ambTitol && <h2 className="fitxa-pellicula__titol">{proposta.titol}</h2>}
      {ambTitol && proposta.lema && <p className="fitxa-pellicula__lema">{proposta.lema}</p>}
      <dl className="fitxa-pellicula__dades">
        <Dada etiqueta="Títol a Espanya">{proposta.titolLocal}</Dada>
        <Dada etiqueta="Direcció">{proposta.directors?.join(', ')}</Dada>
        <Dada etiqueta="Guió">{proposta.guionistes?.join(', ')}</Dada>
        {ambBasics && <Dada etiqueta="País">{proposta.paisos?.join(', ')}</Dada>}
        {ambBasics && <Dada etiqueta="Any">{proposta.any}</Dada>}
        {ambBasics && <Dada etiqueta="Durada">{proposta.durada ? `${proposta.durada} minuts` : null}</Dada>}
        <Dada etiqueta="Idioma">{proposta.idiomes?.join(', ')}</Dada>
        {ambBasics && <Dada etiqueta="Gènere">{proposta.generes?.join(', ')}</Dada>}
        <Dada etiqueta="Repartiment">{repartiment}</Dada>
        <Dada etiqueta="Valoració TMDB">{proposta.valoracio ? `★ ${proposta.valoracio} / 10` : null}</Dada>
      </dl>
      {ambTitol && proposta.sinopsi && <p className="fitxa-pellicula__sinopsi">{proposta.sinopsi}</p>}
      {proposta.tmdbUrl && (
        <a className="enllac fitxa-pellicula__tmdb" href={proposta.tmdbUrl} target="_blank" rel="noopener noreferrer">
          Veure a TMDB
        </a>
      )}
    </div>
  );
}
