import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useIdentitatPublica } from '../../auth/useIdentitatPublica.js';
import { formatData } from '../../lib/propostes/data.js';
import { ordenarPerData } from '../../lib/propostes/propostes.js';
import { useEstatVotacio } from './useEstatVotacio.js';
import LectorCarnet from './LectorCarnet.jsx';
import Carregant from './Carregant.jsx';
import FitxaPublica from './FitxaPublica.jsx';
import CartellPelicula from './CartellPelicula.jsx';
import TitolLocal from './TitolLocal.jsx';
import IconaPolze from './IconaPolze.jsx';
import VotacioTanda from './VotacioTanda.jsx';
import FalladaCarrega from './FalladaCarrega.jsx';
import AvisPrivacitat from './AvisPrivacitat.jsx';
import UltimaTanda from './UltimaTanda.jsx';
import IdentitatLinia from './IdentitatLinia.jsx';

function IconaPlay({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8.5v7l6-3.5-6-3.5Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function AccionsVot({ proposta, onVotar, ambText, senseTrailer }) {
  const classeAccio = `proposta-carta__accio ${ambText ? 'proposta-carta__accio--ample' : ''}`;
  const ambTrailer = proposta.trailerUrl && !senseTrailer;
  if (!onVotar && !ambTrailer) return null;
  return (
    <div className="proposta-carta__footer">
      {onVotar && (
        <div className="proposta-carta__vot-bloc">
          <button type="button" className={classeAccio} onClick={() => onVotar('like')} aria-label="M'agrada">
            <IconaPolze className="proposta-carta__accio-icona" />
            {ambText && <span>M&apos;agrada</span>}
          </button>
          <button type="button" className={classeAccio} onClick={() => onVotar('dislike')} aria-label="No m'agrada">
            <IconaPolze className="proposta-carta__accio-icona proposta-carta__accio-icona--avall" />
            {ambText && <span>No m&apos;agrada</span>}
          </button>
        </div>
      )}
      {ambTrailer && (
        <a
          className={classeAccio}
          href={proposta.trailerUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Veure tràiler"
        >
          <IconaPlay className="proposta-carta__accio-icona" />
          {ambText && <span>Tràiler</span>}
        </a>
      )}
    </div>
  );
}

// El hash de la URL és l'id de la proposta oberta. '#recents' (i l'antic '#top') no n'obren cap.
function llegirHash() {
  const hash = window.location.hash.slice(1);
  return hash === '' || hash === 'recents' || hash === 'top' ? null : hash;
}

export default function PropostesPublic() {
  const { identitat, setIdentitat } = useIdentitatPublica();
  const token = identitat?.token;
  const {
    propostes, propostesPerId, tandaPublica, ultimaTanda, tandaFallida, estat, error, setError, votPendentRef,
    recarregarEstat, tornarAProvar, tandaEstat, votacio, carregant, carregaFallida,
  } = useEstatVotacio({ identitat, setIdentitat });
  const [propostaPendent, setPropostaPendent] = useState(null);
  const [volProposar, setVolProposar] = useState(false);
  const [volVotar, setVolVotar] = useState(false);
  const [propostaObertaId, setPropostaObertaId] = useState(llegirHash);
  const [destiBotoProposar] = useState(() => document.getElementById('propostes-intro-accio'));

  useEffect(() => {
    const handler = () => setPropostaObertaId(llegirHash());
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  useEffect(() => {
    if (!propostaObertaId) return undefined;
    document.body.classList.add('proposta-detall-obert-body');
    return () => document.body.classList.remove('proposta-detall-obert-body');
  }, [propostaObertaId]);

  const handleVotarClick = (proposta, valor) => {
    setError(null);
    setPropostaPendent({ proposta, valor });
  };

  const handleIdentificat = (nova) => {
    setError(null);
    if (propostaPendent) votPendentRef.current = { propostaId: propostaPendent.proposta.id, valor: propostaPendent.valor };
    setPropostaPendent(null);
    setVolVotar(false);
    setIdentitat(nova);
    if (volProposar) {
      setVolProposar(false);
      window.location.assign('/propostes/proposar/');
    }
  };

  const handleProposarClick = () => {
    if (identitat) {
      window.location.assign('/propostes/proposar/');
    } else {
      setVolProposar(true);
    }
  };

  const visitantAmbTanda = !identitat && !!tandaPublica;

  // Mode votació immersiu: res més que la fitxa (sense la intro ni el botó de proposar), també mentre
  // es carrega l'estat d'un soci identificat, perquè no parpellegi.
  const immersiu = !!identitat && (carregant || (votacio && !carregaFallida));

  // La intro (index.astro) s'amaga amb CSS en mode immersiu. `toggle` també treu la classe que el script de la
  // pàgina posa abans de muntar quan hi ha identitat, si al final no hi ha votació.
  useEffect(() => {
    document.body.classList.toggle('propostes-immersiu-body', immersiu);
    return () => document.body.classList.remove('propostes-immersiu-body');
  }, [immersiu]);

  // En mode votació la fitxa oberta no es pinta (taparia la votació, sense botons de vot): es tanca i es neteja el hash.
  const propostaOberta = !immersiu && propostaObertaId ? propostesPerId[propostaObertaId] ?? null : null;
  useEffect(() => {
    if (!immersiu || carregant || !propostaObertaId) return;
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}#recents`);
    setPropostaObertaId(null);
  }, [immersiu, carregant, propostaObertaId]);
  // Fora del mode votació només es mostren les propostes de la tanda activa (la llista general ja no hi és).
  const propostesTanda = propostes && tandaPublica
    ? ordenarPerData(propostes.filter((p) => tandaPublica.propostes.includes(p.id)))
    : [];
  // Els vots del soci només es passen al rànquing si són d'aquesta mateixa tanda.
  const valorsUltimaTanda = ultimaTanda && estat?.dades?.tanda?.id === ultimaTanda.id ? estat.dades.valors : undefined;
  const votarDetall = visitantAmbTanda && propostaOberta && tandaPublica.propostes.includes(propostaOberta.id);

  const obrirProposta = (id) => {
    // eslint-disable-next-line react-hooks/immutability -- pushes a shareable/history-friendly URL, mirrors the hashchange listener above
    window.location.hash = id;
  };

  const tancarProposta = () => {
    history.pushState(null, '', `${window.location.pathname}${window.location.search}#recents`);
    setPropostaObertaId(null);
  };

  // L'h1 i l'explicació són a index.astro (renderitzats al servidor); el botó necessita la identitat i
  // l'illa el porta dins la intro amb un portal. Sense el contenidor (p. ex. a les proves) es pinta aquí.
  const botoProposar = !immersiu && (
    <button type="button" className="btn propostes-intro__boto" onClick={handleProposarClick}>
      Proposar pel·lícula
    </button>
  );

  return (
    <>
      {botoProposar && (destiBotoProposar
        ? createPortal(botoProposar, destiBotoProposar)
        : <div className="propostes-intro__accio">{botoProposar}</div>)}

      <div className={`propostes-public ${immersiu ? 'propostes-public--immersiu' : ''}`}>
        {identitat && !immersiu && !carregaFallida && (
          <IdentitatLinia identitat={identitat} setIdentitat={setIdentitat} sola />
        )}

        {error && <p className="form__error">{error}</p>}

        {carregant && <Carregant />}

        {carregaFallida && (
          <FalladaCarrega onTornarAProvar={tornarAProvar} onSortir={identitat ? () => setIdentitat(null) : undefined} />
        )}

        {!carregant && !carregaFallida && votacio && (
          <VotacioTanda
            key={`${token}-${estat.versio}`}
            identitat={identitat}
            tanda={tandaEstat}
            propostesPerId={propostesPerId}
            estat={estat.dades}
            setIdentitat={setIdentitat}
            onError={setError}
            onRecarregar={recarregarEstat}
          />
        )}

        {!carregant && !carregaFallida && !votacio && (
          tandaPublica === undefined ? (
            <div className="tanda-publica__carregant" role="status"><Carregant /></div>
          ) : tandaFallida ? (
            <div className="tanda-publica tanda-publica__fallada">
              <p className="form__error" role="alert">No s&apos;ha pogut carregar la tanda de votació.</p>
              <button type="button" className="btn" onClick={tornarAProvar}>Tornar-ho a provar</button>
            </div>
          ) : tandaPublica ? (
            <section className="tanda-publica" aria-labelledby="tanda-publica-titol">
              <h2 className="tanda-publica__titol" id="tanda-publica-titol">Tanda activa: {tandaPublica.nom}</h2>
              <p className="tanda-publica__text">
                Aquesta és la tanda que es pot votar ara, fins al {formatData(tandaPublica.tanca)}.
              </p>
              {propostesTanda.length === 0 && (
                <p className="tanda-publica__text">Aquesta tanda encara no té pel·lícules per votar.</p>
              )}
              {!identitat && propostesTanda.length > 0 && (
                <button type="button" className="btn tanda-publica__votar" onClick={() => { setError(null); setVolVotar(true); }}>
                  Votar aquesta tanda
                </button>
              )}
              {propostesTanda.length > 0 && (
                <ul className="propostes-public__llista">
                  {propostesTanda.map((p) => (
                    <li key={p.id} className="proposta-carta">
                      <button
                        type="button"
                        className="proposta-carta__obrir"
                        onClick={() => obrirProposta(p.id)}
                      >
                        <div className="proposta-carta__cartell-marc">
                          <CartellPelicula proposta={p} className="proposta-carta__cartell" />
                        </div>
                        <div className="proposta-carta__info">
                          <span className="proposta-carta__titol">{p.titol}</span>
                          <TitolLocal proposta={p} className="proposta-carta__titol-local" />
                          {p.timestamp?.toDate && (
                            <span className="proposta-carta__data">{formatData(p.timestamp.toDate())}</span>
                          )}
                          {p.sinopsi && <p className="proposta-carta__sinopsi">{p.sinopsi}</p>}
                        </div>
                      </button>
                      <AccionsVot proposta={p} onVotar={visitantAmbTanda ? (valor) => handleVotarClick(p, valor) : undefined} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : ultimaTanda ? (
            <UltimaTanda tanda={ultimaTanda} propostesPerId={propostesPerId} valors={valorsUltimaTanda} />
          ) : (
            <p className="propostes-public__buit">Encara no hi ha cap tanda de votació.</p>
          )
        )}

        {!carregant && !carregaFallida && (votacio || visitantAmbTanda) && (
          <AvisPrivacitat />
        )}

        {propostaOberta && (
          <div className="proposta-detall" role="dialog" aria-modal="true">
            <div className="proposta-detall__capcalera">
              <img className="proposta-detall__logo" src="/logo-footer.png" alt="Cineclub Roda de Berà" />
              <div className="proposta-detall__autor">
                {propostaOberta.nomProposant && (
                  <>
                    <span>Proposada per <b>{propostaOberta.nomProposant}</b></span>
                    {propostaOberta.timestamp?.toDate && (
                      <span className="proposta-detall__data">{formatData(propostaOberta.timestamp.toDate())}</span>
                    )}
                  </>
                )}
              </div>
              <button
                type="button"
                className="proposta-detall__tancar"
                onClick={tancarProposta}
                aria-label="Tornar al llistat"
              >
                ✕
              </button>
            </div>
            <div className="proposta-detall__scroll">
              <FitxaPublica proposta={propostaOberta} senseProposant />
            </div>
            {votarDetall && (
              <div className="proposta-detall__footer">
                <AccionsVot
                  proposta={propostaOberta}
                  onVotar={(valor) => handleVotarClick(propostaOberta, valor)}
                  ambText
                  senseTrailer
                />
              </div>
            )}
          </div>
        )}

        {(propostaPendent || volProposar || volVotar) && (
          <div className="propostes-public__overlay" role="dialog" aria-modal="true">
            <div className="propostes-public__overlay-panell">
              <button
                type="button"
                className="propostes-public__overlay-tancar"
                onClick={() => { setPropostaPendent(null); setVolProposar(false); setVolVotar(false); }}
                aria-label="Cancel·lar"
              >
                ✕
              </button>
              <p className="propostes-public__overlay-text">
                {volProposar ? 'Escaneja el teu carnet per proposar' : 'Escaneja el teu carnet per votar'}
              </p>
              <LectorCarnet onIdentificat={handleIdentificat} />
              <p className="propostes-public__overlay-registre">
                Encara no ets soci/a?{' '}
                <a className="enllac" href="/fes-te-socia/" target="_blank" rel="noopener noreferrer">
                  Fes-te Soci/a
                </a>
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
