import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  collection, getDocs, query, where,
} from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import * as ROUTES from '../../constants/routes';
import BarraDesar from '../../components/BarraDesar';
import Carregant from '../../components/Carregant';
import EnllacContrasenya from '../../components/EnllacContrasenya';
import PaginaAdmin from '../../components/PaginaAdmin';
import ZonaPerill from '../../components/ZonaPerill';
import useFitxaEditable from '../../lib/useFitxaEditable';
import {
  ACCIONS_AUDITORIA, codiError, editarUsuari, formatData, llistarUsuaris, missatgeError, validarUsuari,
} from '../../lib/usuarisTaquilla';
import AccionsUsuari from './AccionsUsuari';
import useAccionsUsuari from './useAccionsUsuari';

const TORNAR = { to: ROUTES.USUARIS_TAQUILLA, etiqueta: 'Usuaris de taquilla' };
const ERROR_CARREGA = "No s'ha pogut carregar l'usuari. Torna-ho a provar.";
const NO_TROBAT = 'Aquest usuari no existeix o no és de taquilla.';
const ERROR_HISTORIAL = "No s'ha pogut carregar l'historial.";
const MAX_HISTORIAL = 20;
const ETIQUETES = { nom: 'Nom', correu: 'Correu electrònic' };

const atributsError = (errors, camp, ajuda) => {
  const descrits = [ajuda, errors[camp] && `${camp}-error`].filter(Boolean).join(' ');
  return {
    ...(errors[camp] ? { 'aria-invalid': true } : {}),
    ...(descrits ? { 'aria-describedby': descrits } : {}),
  };
};

const ms = (t) => (typeof t?.toMillis === 'function' ? t.toMillis() : 0);

function Historial({ uid, versio }) {
  const [entrades, setEntrades] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let actiu = true;
    // Sense `orderBy` (no cal cap índex compost): en són poques per usuari i s'ordenen aquí.
    getDocs(query(collection(db, 'auditoriaUsuaris'), where('objectiuUid', '==', uid)))
      .then((snap) => {
        if (!actiu) return;
        const llista = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setEntrades(llista.sort((a, b) => ms(b.timestamp) - ms(a.timestamp)).slice(0, MAX_HISTORIAL));
        setError(false);
      })
      .catch(() => { if (actiu) setError(true); });
    return () => { actiu = false; };
  }, [uid, versio]);

  return (
    <section className="usuaris-taquilla__seccio" aria-labelledby="historial-titol">
      <h2 id="historial-titol" className="usuaris-taquilla__subtitol">Historial</h2>
      {error && <p className="form__error" role="alert">{ERROR_HISTORIAL}</p>}
      {!error && entrades === null && <p>Carregant l&apos;historial…</p>}
      {!error && entrades?.length === 0 && <p>Encara no hi ha cap canvi registrat.</p>}
      {!error && entrades?.length > 0 && (
        <ul className="usuaris-taquilla__historial">
          {entrades.map((e) => (
            <li key={e.id} className="usuaris-taquilla__historial-item">
              <span className="usuaris-taquilla__historial-data">{formatData(e.timestamp)}</span>
              <span>{ACCIONS_AUDITORIA[e.accio] ?? e.accio}</span>
              <span className="usuaris-taquilla__historial-actor">per {e.actorCorreu ?? e.actorUid}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FitxaUsuari({ usuariInicial }) {
  const navigate = useNavigate();
  const [usuari, setUsuari] = useState(usuariInicial);
  const [versioHistorial, setVersioHistorial] = useState(0);
  const refrescaHistorial = () => setVersioHistorial((v) => v + 1);
  const [inicial] = useState(() => ({ nom: usuariInicial.nom, correu: usuariInicial.correu }));
  const accions = useAccionsUsuari({
    onCanviat: (_uid, canvis) => { setUsuari((u) => ({ ...u, ...canvis })); refrescaHistorial(); },
    onEliminat: () => navigate(ROUTES.USUARIS_TAQUILLA),
  });
  const { setEnllac } = accions;

  const onDesar = async ({ valors: v }) => {
    const errorsValidacio = validarUsuari(v);
    if (Object.keys(errorsValidacio).length) return { errors: errorsValidacio };
    const dades = { uid: usuari.uid, nom: v.nom.trim(), correu: v.correu.trim().toLowerCase() };
    let resultat;
    try {
      resultat = await editarUsuari(dades);
    } catch (e) {
      const codi = codiError(e);
      if (codi === 'already-exists') return { errors: { correu: missatgeError(e) } };
      if (codi === 'invalid-argument') return { errors: { [/correu/i.test(e.message) ? 'correu' : 'nom']: missatgeError(e) } };
      throw e;
    }
    const canviaCorreu = dades.correu !== usuari.correu;
    setUsuari((u) => ({ ...u, nom: dades.nom, correu: dades.correu }));
    if (canviaCorreu) setEnllac({ uid: usuari.uid, correu: dades.correu, contrasenyaAnullada: true, ...resultat });
    refrescaHistorial();
    return undefined;
  };

  const {
    valors, canvia, estat, desa, descarta, errorDesat, errors,
  } = useFitxaEditable({ inicial, onDesar });

  const handleSubmit = (e) => {
    e.preventDefault();
    desa();
  };

  const errorsBarra = Object.keys(ETIQUETES).filter((c) => errors[c]).map((c) => ({
    pestanya: c, etiquetaPestanya: ETIQUETES[c], missatge: errors[c],
  }));
  const desant = estat === 'desant';
  const restablir = async (u) => {
    await accions.restableix(u);
    refrescaHistorial();
  };
  const accionsFitxa = { ...accions, restableix: restablir };

  return (
    <PaginaAdmin
      as="form"
      amplada="formulari"
      ambBarra
      className="usuaris-taquilla__form"
      titol={usuari.nom || usuari.correu}
      tornar={TORNAR}
      onSubmit={handleSubmit}
      noValidate
    >
      <div className="form__field">
        <label className="form__label" htmlFor="nom">Nom</label>
        <input
          id="nom"
          className="form__input"
          value={valors.nom}
          maxLength={80}
          autoComplete="off"
          aria-required="true"
          onChange={(e) => canvia('nom', e.target.value)}
          {...atributsError(errors, 'nom')}
        />
        {errors.nom && <p id="nom-error" className="form__error">{errors.nom}</p>}
      </div>
      <div className="form__field">
        <label className="form__label" htmlFor="correu">Correu electrònic</label>
        <input
          id="correu"
          type="email"
          className="form__input"
          value={valors.correu}
          autoComplete="off"
          aria-required="true"
          onChange={(e) => canvia('correu', e.target.value)}
          {...atributsError(errors, 'correu', 'correu-ajuda')}
        />
        <p id="correu-ajuda" className="form__ajuda">
          Si el canvies, la contrasenya actual deixarà de funcionar, se li tancaran les sessions obertes i rebrà a la nova adreça un enllaç per triar-ne una de nova.
        </p>
        {errors.correu && <p id="correu-error" className="form__error">{errors.correu}</p>}
      </div>

      <section className="usuaris-taquilla__seccio" aria-labelledby="acces-titol">
        <h2 id="acces-titol" className="usuaris-taquilla__subtitol">Accés</h2>
        <dl className="usuaris-taquilla__detalls">
          <dt>Estat</dt>
          <dd>
            <span className={`badge ${usuari.desactivat ? 'badge--desactivat' : 'badge--al-dia'}`}>
              {usuari.desactivat ? 'Desactivat' : 'Actiu'}
            </span>
          </dd>
          <dt>Creat</dt>
          <dd>{formatData(usuari.creat)}</dd>
          <dt>Últim accés</dt>
          <dd>{formatData(usuari.ultimAcces)}</dd>
        </dl>
        {usuari.desactivat && (
          <p className="form__ajuda">Desactivat: no pot entrar. Si tenia la sessió oberta, la perd en menys d&apos;una hora.</p>
        )}
        <AccionsUsuari usuari={usuari} accions={accionsFitxa} desactivat={desant} />
        {accions.error && <p className="form__error" role="alert">{accions.error.missatge}</p>}
        {accions.enllac && <EnllacContrasenya {...accions.enllac} />}
      </section>

      <Historial uid={usuari.uid} versio={versioHistorial} />

      <ZonaPerill descripcio="Elimina el compte: perdrà l'accés a la taquilla. Aquesta acció no es pot desfer.">
        <button
          className="btn btn--perill"
          type="button"
          disabled={desant || accions.ocupat !== null}
          onClick={() => accions.elimina(usuari)}
        >
          Elimina l&apos;usuari
        </button>
      </ZonaPerill>

      <BarraDesar
        estat={estat}
        errors={errorsBarra}
        onAnarA={(camp) => document.getElementById(camp)?.focus()}
        onDescarta={descarta}
        missatgeError={errorDesat}
      />
    </PaginaAdmin>
  );
}

function CarregaUsuari({ uid }) {
  const [estat, setEstat] = useState({ usuari: null, error: null });

  useEffect(() => {
    let actiu = true;
    llistarUsuaris()
      .then((llista) => {
        if (!actiu) return;
        const usuari = llista.find((u) => u.uid === uid);
        setEstat(usuari ? { usuari, error: null } : { usuari: null, error: NO_TROBAT });
      })
      .catch((e) => { if (actiu) setEstat({ usuari: null, error: missatgeError(e, ERROR_CARREGA) }); });
    return () => { actiu = false; };
  }, [uid]);

  if (estat.error) {
    return (
      <PaginaAdmin amplada="formulari" titol="Usuari de taquilla" tornar={TORNAR}>
        <p className="form__error" role="alert">{estat.error}</p>
      </PaginaAdmin>
    );
  }
  if (!estat.usuari) return <Carregant />;
  return <FitxaUsuari usuariInicial={estat.usuari} />;
}

export default function UsuariTaquillaFitxa() {
  const { uid } = useParams();
  return <CarregaUsuari key={uid} uid={uid} />;
}
