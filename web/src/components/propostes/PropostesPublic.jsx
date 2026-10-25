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
import VotacioTanda from './VotacioTanda.jsx';
import FalladaCarrega from './FalladaCarrega.jsx';
import AvisPrivacitat from './AvisPrivacitat.jsx';
import UltimaTanda from './UltimaTanda.jsx';
import IdentitatLinia from './IdentitatLinia.jsx';
import { useDialegModal } from './useDialegModal.js';

// El hash de la URL és l'id de la proposta oberta. '#recents' (i l'antic '#top') no n'obren cap.
function llegirHash() {
  const hash = window.location.hash.slice(1);
  return hash === '' || hash === 'recents' || hash === 'top' ? null : hash;
}

const urlAmbHash = (hash) => `${window.location.pathname}${window.location.search}#${hash}`;

// Fitxa d'una proposta a pantalla completa (diàleg modal: Escape la tanca com la creu).
function DetallProposta({ proposta, ambPeuVotar, onVotar, onTancar }) {
  const ref = useDialegModal(onTancar);
  return (
    <div className="proposta-detall" role="dialog" aria-modal="true" aria-label={proposta.titol} tabIndex={-1} ref={ref}>
      <div className="proposta-detall__capcalera">
        <img className="proposta-detall__logo" src="/logo-footer.png" alt="Cineclub Roda de Berà" />
        <div className="proposta-detall__autor">
          {proposta.nomProposant && (
            <>
              <span>Proposada per <b>{proposta.nomProposant}</b></span>
              {proposta.timestamp?.toDate && (
                <span className="proposta-detall__data">{formatData(proposta.timestamp.toDate())}</span>
              )}
            </>
          )}
        </div>
        <button
          type="button"
          className="proposta-detall__tancar"
          onClick={onTancar}
          aria-label="Tornar al llistat"
        >
          ✕
        </button>
      </div>
      <div className="proposta-detall__scroll">
        <FitxaPublica proposta={proposta} senseProposant />
      </div>
      {ambPeuVotar && (
        <div className="proposta-detall__peu">
          <button type="button" className="btn proposta-detall__votar" onClick={onVotar}>
            Votar aquesta tanda de pel·lícules
          </button>
        </div>
      )}
    </div>
  );
}

// Lector del carnet per proposar o votar (diàleg modal: Escape el cancel·la com la creu).
function LectorModal({ text, onCancel, onIdentificat }) {
  const ref = useDialegModal(onCancel);
  return (
    <div
      className="propostes-public__overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="propostes-overlay-text"
      tabIndex={-1}
      ref={ref}
    >
      <div className="propostes-public__overlay-panell">
        <button
          type="button"
          className="propostes-public__overlay-tancar"
          onClick={onCancel}
          aria-label="Cancel·lar"
        >
          ✕
        </button>
        <p className="propostes-public__overlay-text" id="propostes-overlay-text">{text}</p>
        <LectorCarnet onIdentificat={onIdentificat} />
        <p className="propostes-public__overlay-registre">
          Encara no ets soci/a?{' '}
          <a className="enllac" href="/fes-te-socia/" target="_blank" rel="noopener noreferrer">
            Fes-te Soci/a
          </a>
        </p>
      </div>
    </div>
  );
}

export default function PropostesPublic() {
  const { identitat, setIdentitat } = useIdentitatPublica();
  const token = identitat?.token;
  const {
    propostes, propostesPerId, tandaPublica, ultimaTanda, tandaFallida, estat, error, setError,
    recarregarEstat, tornarAProvar, tandaEstat, votacio, carregant, carregaFallida,
  } = useEstatVotacio({ identitat, setIdentitat });
  const [volProposar, setVolProposar] = useState(false);
  const [volVotar, setVolVotar] = useState(false);
  const [propostaObertaId, setPropostaObertaId] = useState(llegirHash);
  const [destiBotoProposar] = useState(() => document.getElementById('propostes-intro-accio'));

  // Enrere/endavant del navegador (i un hash canviat a mà) obren o tanquen el detall.
  useEffect(() => {
    const handler = () => setPropostaObertaId(llegirHash());
    window.addEventListener('hashchange', handler);
    window.addEventListener('popstate', handler);
    return () => {
      window.removeEventListener('hashchange', handler);
      window.removeEventListener('popstate', handler);
    };
  }, []);

  const handleIdentificat = (nova) => {
    setError(null);
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
  const iniciarVot = () => { setError(null); setVolVotar(true); };

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
    history.replaceState(null, '', urlAmbHash('recents'));
    setPropostaObertaId(null);
  }, [immersiu, carregant, propostaObertaId]);

  // El scroll del cos només es bloqueja amb el detall a la vista: un #id desconegut (proposta retirada,
  // esborrada o qualsevol #foo) no pinta cap detall i no ha de deixar la pàgina sense scroll.
  const detallObert = !!propostaOberta;
  useEffect(() => {
    if (!detallObert) return undefined;
    document.body.classList.add('proposta-detall-obert-body');
    return () => document.body.classList.remove('proposta-detall-obert-body');
  }, [detallObert]);
  // Fora del mode votació només es mostren les propostes de la tanda activa (la llista general ja no hi és).
  const propostesTanda = propostes && tandaPublica
    ? ordenarPerData(propostes.filter((p) => tandaPublica.propostes.includes(p.id)))
    : [];
  // El visitant pot votar la tanda (botó del bloc i peu del detall) si té propostes per votar.
  const potVotarTanda = !identitat && propostesTanda.length > 0;
  // Els vots del soci només es passen al rànquing si són d'aquesta mateixa tanda.
  const valorsUltimaTanda = ultimaTanda && estat?.dades?.tanda?.id === ultimaTanda.id ? estat.dades.valors : undefined;

  // Obrir des de la llista afegeix una entrada a l'historial (URL compartible; Enrere tanca el detall),
  // marcada a `history.state` perquè en tancar se'n pugui tornar enrere en lloc d'afegir-ne una altra.
  const obrirProposta = (id) => {
    history.pushState({ propostaDetall: true }, '', urlAmbHash(id));
    setPropostaObertaId(id);
  };

  // Sense entrada pròpia (enllaç directe a /propostes/#id) es substitueix el hash: Enrere surt de la pàgina.
  const tancarProposta = () => {
    if (history.state?.propostaDetall) history.back();
    else history.replaceState(null, '', urlAmbHash('recents'));
    setPropostaObertaId(null);
  };

  const cancelarLector = () => { setVolProposar(false); setVolVotar(false); };

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
              <p className="form__error" role="alert">No s&apos;ha pogut carregar la tanda de pel·lícules.</p>
              <button type="button" className="btn" onClick={tornarAProvar}>Tornar-ho a provar</button>
            </div>
          ) : tandaPublica ? (
            <section className="tanda-publica" aria-labelledby="tanda-publica-titol">
              <h2 className="tanda-publica__titol" id="tanda-publica-titol">Tanda de pel·lícules activa: {tandaPublica.nom}</h2>
              <p className="tanda-publica__text">
                Aquesta és la tanda de pel·lícules que es pot votar ara, fins al {formatData(tandaPublica.tanca)}.
              </p>
              {propostesTanda.length === 0 && (
                <p className="tanda-publica__text">Aquesta tanda encara no té pel·lícules per votar.</p>
              )}
              {potVotarTanda && (
                <button type="button" className="btn tanda-publica__votar" onClick={iniciarVot}>
                  Votar aquesta tanda de pel·lícules
                </button>
              )}
              {propostesTanda.length > 0 && (
                <ul className="propostes-public__llista" aria-label="Pel·lícules de la tanda">
                  {propostesTanda.map((p) => (
                    <li key={p.id} className="cartell-tanda">
                      <button
                        type="button"
                        className="cartell-tanda__obrir"
                        aria-label={p.titol}
                        onClick={() => obrirProposta(p.id)}
                      >
                        <CartellPelicula proposta={p} className="cartell-tanda__imatge" loading="lazy" />
                        <span className="cartell-tanda__titol">{p.titol}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : ultimaTanda ? (
            <UltimaTanda tanda={ultimaTanda} propostesPerId={propostesPerId} valors={valorsUltimaTanda} />
          ) : (
            <p className="propostes-public__buit">Encara no hi ha cap tanda de pel·lícules.</p>
          )
        )}

        {!carregant && !carregaFallida && (votacio || visitantAmbTanda) && (
          <AvisPrivacitat />
        )}

        {propostaOberta && (
          <DetallProposta
            proposta={propostaOberta}
            ambPeuVotar={potVotarTanda && propostesTanda.some((p) => p.id === propostaOberta.id)}
            onVotar={iniciarVot}
            onTancar={tancarProposta}
          />
        )}

        {(volProposar || volVotar) && (
          <LectorModal
            text={volProposar ? 'Escaneja el teu carnet per proposar' : 'Escaneja el teu carnet per votar'}
            onCancel={cancelarLector}
            onIdentificat={handleIdentificat}
          />
        )}
      </div>
    </>
  );
}
