import { Link } from 'react-router-dom';
import * as ROUTES from '../../../constants/routes';
import { formatData } from '../../../lib/data';
import { formatEuros } from '../../../lib/moviments';
import { urlWeb } from '../../../lib/distribuidores';
import { dadesEfectives } from '../../../components/GestioInternaProposta';
import { CLASSE_ESTAT, etiquetaEstat } from '../campsProposta';

const IDIOMES_SINOPSI = { es: 'castellà', en: 'anglès' };

const PerDefecte = () => <span className="fitxa-proposta__per-defecte"> (per defecte de la distribuïdora)</span>;

function Dada({ etiqueta, children, className }) {
  return (
    <>
      <dt className="fitxa-proposta__etiqueta">{etiqueta}</dt>
      <dd className={['fitxa-proposta__valor', className].filter(Boolean).join(' ')}>{children}</dd>
    </>
  );
}

function GestioInterna({ interna, distribuidores }) {
  if (!interna) return <p className="fitxa-proposta__nota">No s&apos;han pogut carregar les dades internes.</p>;
  const distribuidora = distribuidores.find((d) => d.id === interna.distribuidoraId);
  const efectives = dadesEfectives(interna, distribuidora);
  return (
    <dl className="fitxa-proposta__dades">
      <Dada etiqueta="Distribuïdora">
        {distribuidora ? (
          <>
            <Link className="enllac" to={ROUTES.DISTRIBUIDORES_EDITAR.replace(':id', distribuidora.id)}>{distribuidora.nom}</Link>
            {distribuidora.web && (
              <> · <a className="enllac" href={urlWeb(distribuidora.web)} target="_blank" rel="noopener noreferrer">{distribuidora.web}</a></>
            )}
            {(distribuidora.contacte || distribuidora.correu) && (
              <span className="fitxa-proposta__contacte">
                {distribuidora.contacte}
                {distribuidora.contacte && distribuidora.correu && ' · '}
                {distribuidora.correu && <a className="enllac" href={`mailto:${distribuidora.correu}`}>{distribuidora.correu}</a>}
              </span>
            )}
          </>
        ) : '—'}
      </Dada>
      <Dada etiqueta="Preu">
        {efectives.preu === null ? '—' : formatEuros(efectives.preu)}
        {efectives.preuPerDefecte && <PerDefecte />}
      </Dada>
      <Dada etiqueta="Condicions especials" className="fitxa-proposta__valor--linies">
        {efectives.condicions || '—'}
        {efectives.condicionsPerDefecte && <PerDefecte />}
      </Dada>
    </dl>
  );
}

// Pestanya de només lectura amb l'estat desat de la proposta.
export default function ResumProposta({
  proposta, proposant, tandes, sessio, interna, distribuidores,
}) {
  const data = proposta.timestamp?.toDate ? formatData(proposta.timestamp.toDate()) : '';
  return (
    <div className="fitxa-proposta__targetes">
      {!proposta.tmdbId && (
        <p className="fitxa-proposta__avis">Encara no té pel·lícula de TMDB associada: tria&apos;n una a la pestanya Pel·lícula.</p>
      )}

      <section className="fitxa-proposta__targeta" aria-labelledby="resum-proposta">
        <h2 className="fitxa-proposta__targeta-titol" id="resum-proposta">Proposta</h2>
        <dl className="fitxa-proposta__dades">
          <Dada etiqueta="Proposada per">
            {proposant || proposta.nomProposant || '—'}
            {data && ` · ${data}`}
          </Dada>
          <Dada etiqueta="Estat">
            <span className={`badge ${CLASSE_ESTAT[proposta.estat] ?? ''}`}>{etiquetaEstat(proposta.estat)}</span>
          </Dada>
          <Dada etiqueta="Comentari del soci" className="fitxa-proposta__valor--linies">{proposta.comentari || '—'}</Dada>
          {proposta.enllac && (
            <Dada etiqueta="Enllaç del soci">
              <a className="enllac" href={proposta.enllac} target="_blank" rel="noopener noreferrer">{proposta.enllac}</a>
            </Dada>
          )}
          <Dada etiqueta="Tandes">
            {tandes.length === 0 ? '—' : (
              <ul className="fitxa-proposta__tandes">
                {tandes.map((t) => (
                  <li key={t.id}>
                    <Link className="enllac" to={ROUTES.TANDES_EDITAR.replace(':id', t.id)}>{t.nom}</Link>
                    {t.oberta && ' (oberta)'}
                    {' · '}
                    <Link
                      className="enllac"
                      to={ROUTES.TANDES_RESULTATS.replace(':id', t.id)}
                      aria-label={`Resultats de ${t.nom}`}
                    >
                      Resultats
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Dada>
          <Dada etiqueta="Sessió">
            {sessio
              ? <Link className="enllac" to={ROUTES.SESSIONS_EDITAR.replace(':id', sessio.id)}>{sessio.titol || 'Sessió'}</Link>
              : '—'}
          </Dada>
        </dl>
      </section>

      <section className="fitxa-proposta__targeta fitxa-proposta__targeta--privada" aria-labelledby="resum-gestio-interna">
        <h2 className="fitxa-proposta__targeta-titol" id="resum-gestio-interna">
          Gestió interna <span className="fitxa-proposta__privat">Privat</span>
        </h2>
        <GestioInterna interna={interna} distribuidores={distribuidores} />
      </section>

      {proposta.sinopsi && (
        <section className="fitxa-proposta__targeta" aria-labelledby="resum-sinopsi">
          <h2 className="fitxa-proposta__targeta-titol" id="resum-sinopsi">Sinopsi</h2>
          <p className="fitxa-proposta__sinopsi">{proposta.sinopsi}</p>
          {IDIOMES_SINOPSI[proposta.sinopsiIdioma] && (
            <p className="fitxa-proposta__nota">
              Aquesta sinopsi és en {IDIOMES_SINOPSI[proposta.sinopsiIdioma]}: tradueix-la a la pestanya Pel·lícula.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
