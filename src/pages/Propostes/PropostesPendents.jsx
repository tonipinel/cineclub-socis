import {
  useCallback, useEffect, useId, useMemo, useRef, useState,
} from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import * as ROUTES from '../../constants/routes';
import { formatEuros } from '../../lib/moviments';
import { formatDataHora } from '../../lib/data';
import {
  construirFiles, filtrarFiles, ordenarFiles, agruparPerTanda, recompteEstats,
  llegirParametres, escriureParametres, infoTanda, ordenarTandes, ESTATS, PARAMETRES_PER_DEFECTE,
} from '../../lib/propostesLlistat';
import Carregant from '../../components/Carregant';
import BotoAfegir from '../../components/BotoAfegir';
import BotoFiltres from '../../components/BotoFiltres';
import PaginaAdmin from '../../components/PaginaAdmin';
import ErrorCarrega from '../../components/ErrorCarrega';
import useErrorCarrega from '../../lib/useErrorCarrega';

const CLASSE_ESTAT = {
  pendent: 'badge--pendent', aprovada: 'badge--al-dia', rebutjada: 'badge--vencut', programada: 'badge--nou-registre',
};

const ETIQUETES_ESTAT = {
  pendent: 'Pendent', aprovada: 'Aprovada', rebutjada: 'Rebutjada', programada: 'Programada',
};

const COLUMNES = [
  ['titol', 'Proposta'],
  ['proposant', 'Proposant'],
  ['distribuidora', 'Distribuïdora'],
  ['preu', 'Preu'],
  ['estat', 'Estat'],
  ['tanda', 'Tanda'],
  ['sessio', 'Sessió'],
];

const RETARD_CERCA = 250;

const textPropostes = (n) => (n === 1 ? '1 proposta' : `${n} propostes`);

// Les dades internes, les distribuïdores, les tandes i les sessions són informatives: si no es
// poden llegir, el llistat es mostra igualment, només amb el que sí que s'ha llegit.
const llegirOBuit = (nom) => getDocs(collection(db, nom)).catch(() => ({ docs: [] }));
const ambId = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

const CELLES = {
  titol: (f) => <Link className="enllac" to={ROUTES.PROPOSTES_EDITAR.replace(':id', f.id)}>{f.titol}</Link>,
  proposant: (f) => f.proposant || '—',
  distribuidora: (f) => f.distribuidora?.nom ?? '—',
  preu: (f) => (
    <>
      {f.preu === null ? '—' : formatEuros(f.preu)}
      {f.preuPerDefecte && (
        <span className="propostes-pendents__per-defecte" title="Preu per defecte de la distribuïdora"> *</span>
      )}
    </>
  ),
  estat: (f) => <span className={`badge ${CLASSE_ESTAT[f.estat] ?? ''}`}>{ETIQUETES_ESTAT[f.estat] ?? f.estat}</span>,
  tanda: (f) => (f.tandes.length === 0 ? '—' : (
    <ul className="propostes-pendents__tandes">
      {f.tandes.map((t) => (
        <li key={t.id}><Link className="enllac" to={ROUTES.TANDES_EDITAR.replace(':id', t.id)}>{t.nom}</Link></li>
      ))}
    </ul>
  )),
  sessio: (f) => (f.sessio
    ? <Link className="enllac" to={ROUTES.SESSIONS_EDITAR.replace(':id', f.sessio.id)}>{f.sessio.titol}</Link>
    : '—'),
};

function TaulaPropostes({
  files, columnes, ordre, onOrdenar, etiqueta,
}) {
  return (
    <div className="scroll-horitzontal propostes-pendents__taula-wrap" role="region" tabIndex={0} aria-label={etiqueta}>
      <table className="propostes-pendents__taula">
        <thead>
          <tr>
            {columnes.map(([columna, nom]) => {
              const activa = ordre.columna === columna;
              const direccio = ordre.direccio === 'asc' ? 'ascending' : 'descending';
              return (
                <th key={columna} aria-sort={activa ? direccio : undefined}>
                  <button type="button" className="propostes-pendents__ordenar" onClick={() => onOrdenar(columna)}>
                    {nom}
                    {activa && <span aria-hidden="true">{ordre.direccio === 'asc' ? ' ▲' : ' ▼'}</span>}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {files.map((f) => (
            <tr key={f.id}>
              {columnes.map(([columna]) => (
                <td key={columna} className={`propostes-pendents__cella--${columna}`}>{CELLES[columna](f)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SeccioTanda({
  grup, ordre, onOrdenar, columnes,
}) {
  const id = useId();
  const { tanda } = grup;
  const nom = tanda?.nom ?? 'Sense tanda';
  return (
    <section className="propostes-pendents__tanda" aria-labelledby={id}>
      <header className="propostes-pendents__tanda-capcalera">
        <h2 id={id} className="propostes-pendents__tanda-titol">{nom}</h2>
        {tanda && (
          <span className={`badge ${tanda.oberta ? 'badge--al-dia' : 'badge--desactivat'}`}>{tanda.oberta ? 'Oberta' : 'Tancada'}</span>
        )}
        {tanda && <span className="propostes-pendents__tanda-tanca">Tanca: {formatDataHora(tanda.tanca)}</span>}
        <span className="propostes-pendents__tanda-recompte">{textPropostes(grup.files.length)}</span>
        {tanda && (
          <Link
            className="enllac propostes-pendents__tanda-resultats"
            to={ROUTES.TANDES_RESULTATS.replace(':id', tanda.id)}
            aria-label={`Resultats de ${nom}`}
          >
            Resultats
          </Link>
        )}
      </header>
      <TaulaPropostes
        files={ordenarFiles(grup.files, ordre)}
        columnes={columnes}
        ordre={ordre}
        onOrdenar={onOrdenar}
        etiqueta={`Taula de propostes: ${nom}`}
      />
    </section>
  );
}

function Llistat({ dades, filtresOberts }) {
  const {
    propostes, internes, distribuidores, tandes, sessions,
  } = dades;
  const [searchParams, setSearchParams] = useSearchParams();
  const { key: claUbicacio } = useLocation();
  const context = useMemo(() => ({ tandes, distribuidores }), [tandes, distribuidores]);
  const parametres = useMemo(() => llegirParametres(searchParams, context), [searchParams, context]);
  const [cerca, setCerca] = useState(parametres.cerca);
  // Darrera cerca que hi ha (o que hi hem escrit) a la URL, si la navegació ve de nosaltres i el
  // temporitzador de la cerca pendent.
  const cercaUrl = useRef(parametres.cerca);
  const escripturaPropia = useRef(false);
  const temporitzador = useRef(null);

  // Cada canvi es calcula sobre la URL del moment (no sobre la del darrer render), perquè la cerca
  // amb retard no desfaci un altre canvi fet mentrestant.
  const actualitzar = useCallback((canvis) => {
    escripturaPropia.current = true;
    setSearchParams(
      (actuals) => escriureParametres({ ...llegirParametres(actuals, context), ...canvis }),
      { replace: true },
    );
  }, [setSearchParams, context]);

  // Una navegació que no és nostra (menú, enllaç, enrere/endavant) mana sobre el camp de cerca i
  // anul·la la cerca pendent d'escriure.
  useEffect(() => {
    if (escripturaPropia.current) {
      escripturaPropia.current = false;
      return;
    }
    clearTimeout(temporitzador.current);
    cercaUrl.current = parametres.cerca;
    setCerca(parametres.cerca);
  }, [claUbicacio, parametres.cerca]);

  useEffect(() => {
    if (cerca === cercaUrl.current) return undefined;
    temporitzador.current = setTimeout(() => {
      cercaUrl.current = cerca;
      actualitzar({ cerca });
    }, RETARD_CERCA);
    return () => clearTimeout(temporitzador.current);
  }, [cerca, actualitzar]);

  const avui = useMemo(() => new Date(), []);
  const files = useMemo(() => construirFiles({
    propostes, internes, distribuidores, tandes, sessions, avui,
  }), [propostes, internes, distribuidores, tandes, sessions, avui]);
  const opcionsTanda = useMemo(() => tandes.map((t) => infoTanda(t, avui)).sort(ordenarTandes), [tandes, avui]);
  const opcionsDistribuidora = useMemo(
    () => [...distribuidores.values()].sort((a, b) => String(a.nom ?? '').localeCompare(String(b.nom ?? ''), 'ca')),
    [distribuidores],
  );

  const {
    estats, tanda, distribuidora, ordre,
  } = parametres;
  // Els recomptes dels xips es fan sense el filtre d'estat, perquè continuïn informant.
  const senseEstat = useMemo(
    () => filtrarFiles(files, { cerca, tanda, distribuidora }),
    [files, cerca, tanda, distribuidora],
  );
  const recompte = useMemo(() => recompteEstats(senseEstat), [senseEstat]);
  const filtrades = useMemo(() => filtrarFiles(senseEstat, { estats }), [senseEstat, estats]);
  const perTanda = parametres.vista === 'tandes';
  // A la vista per tanda no hi ha columna Tanda: un ordre per tanda s'hi aplica com el per defecte,
  // perquè l'ordre actiu sempre tingui capçalera (sense tocar la URL).
  const ordreVisible = perTanda && ordre.columna === 'tanda' ? PARAMETRES_PER_DEFECTE.ordre : ordre;
  const ordenades = useMemo(() => ordenarFiles(filtrades, ordre), [filtrades, ordre]);
  const grups = useMemo(() => {
    const tots = agruparPerTanda(filtrades);
    // Amb una tanda concreta filtrada, les altres tandes de les mateixes propostes no s'hi mostren.
    return ['totes', 'cap'].includes(tanda) ? tots : tots.filter((g) => g.clau === tanda);
  }, [filtrades, tanda]);

  const totsEstats = estats.length === ESTATS.length;
  const filtresActius = cerca !== '' || !totsEstats
    || tanda !== PARAMETRES_PER_DEFECTE.tanda || distribuidora !== PARAMETRES_PER_DEFECTE.distribuidora;

  // Amb tots els estats («Totes»), clicar-ne un el selecciona sol; si es treu l'últim, es torna a
  // «Totes» (la URL no pot expressar una selecció buida).
  const alternarEstat = (estat) => {
    let nous;
    if (totsEstats) nous = [estat];
    else if (estats.includes(estat)) nous = estats.filter((e) => e !== estat);
    else nous = ESTATS.filter((e) => e === estat || estats.includes(e));
    actualitzar({ estats: nous.length > 0 ? nous : ESTATS });
  };

  const ordenar = (columna) => {
    const direccio = ordre.columna === columna && ordre.direccio === 'asc' ? 'desc' : 'asc';
    actualitzar({ ordre: { columna, direccio } });
  };

  const netejar = () => {
    clearTimeout(temporitzador.current);
    cercaUrl.current = '';
    setCerca('');
    actualitzar({
      cerca: '', estats: ESTATS, tanda: PARAMETRES_PER_DEFECTE.tanda, distribuidora: PARAMETRES_PER_DEFECTE.distribuidora,
    });
  };

  if (propostes.length === 0) return <p>Encara no hi ha cap proposta.</p>;

  const columnes = perTanda ? COLUMNES.filter(([c]) => c !== 'tanda') : COLUMNES;

  return (
    <>
      <div className="propostes-pendents__eines">
        <div className="propostes-pendents__xips" role="group" aria-label="Filtra per estat">
          <button
            type="button"
            className={`propostes-pendents__xip ${totsEstats ? 'propostes-pendents__xip--actiu' : ''}`}
            aria-pressed={totsEstats}
            onClick={() => actualitzar({ estats: ESTATS })}
          >
            Totes <span className="propostes-pendents__xip-recompte">{senseEstat.length}</span>
          </button>
          {ESTATS.map((estat) => {
            const actiu = !totsEstats && estats.includes(estat);
            return (
              <button
                key={estat}
                type="button"
                className={`propostes-pendents__xip ${actiu ? 'propostes-pendents__xip--actiu' : ''}`}
                aria-pressed={actiu}
                onClick={() => alternarEstat(estat)}
              >
                {ETIQUETES_ESTAT[estat]} <span className="propostes-pendents__xip-recompte">{recompte[estat]}</span>
              </button>
            );
          })}
        </div>
        <div className="propostes-pendents__barra">
          <input
            type="search"
            className="form__input propostes-pendents__cerca"
            aria-label="Cerca una proposta"
            placeholder="Cerca per títol, proposant o distribuïdora"
            value={cerca}
            onChange={(e) => setCerca(e.target.value)}
          />
          <div className="propostes-pendents__vista" role="group" aria-label="Vista">
            {[['llista', 'Llista'], ['tandes', 'Per tanda']].map(([vista, nom]) => (
              <button
                key={vista}
                type="button"
                className={`propostes-pendents__vista-boto ${parametres.vista === vista ? 'propostes-pendents__vista-boto--actiu' : ''}`}
                aria-pressed={parametres.vista === vista}
                onClick={() => actualitzar({ vista })}
              >
                {nom}
              </button>
            ))}
          </div>
        </div>
        <div className={`propostes-pendents__filtres-wrap ${filtresOberts ? 'propostes-pendents__filtres-wrap--obert' : ''}`}>
          <div className="propostes-pendents__filtres">
            <select
              className="form__input"
              aria-label="Filtra per tanda"
              value={tanda}
              onChange={(e) => actualitzar({ tanda: e.target.value })}
            >
              <option value="totes">Totes les tandes</option>
              <option value="cap">Sense tanda</option>
              {opcionsTanda.map((t) => (
                <option key={t.id} value={t.id}>{t.oberta ? `${t.nom} (oberta)` : t.nom}</option>
              ))}
            </select>
            <select
              className="form__input"
              aria-label="Filtra per distribuïdora"
              value={distribuidora}
              onChange={(e) => actualitzar({ distribuidora: e.target.value })}
            >
              <option value="totes">Totes les distribuïdores</option>
              <option value="cap">Sense distribuïdora</option>
              {opcionsDistribuidora.map((d) => <option key={d.id} value={d.id}>{d.nom}</option>)}
            </select>
          </div>
        </div>
      </div>
      <div className="propostes-pendents__resum">
        <p className="propostes-pendents__total" aria-live="polite">{textPropostes(filtrades.length)}</p>
        {filtresActius && filtrades.length > 0 && (
          <button type="button" className="propostes-pendents__netejar" onClick={netejar}>Neteja els filtres</button>
        )}
      </div>
      {filtrades.length === 0 && (
        <div className="propostes-pendents__buit">
          <p>Cap proposta coincideix amb els filtres.</p>
          <button type="button" className="btn btn--negre" onClick={netejar}>Neteja els filtres</button>
        </div>
      )}
      {filtrades.length > 0 && !perTanda && (
        <TaulaPropostes files={ordenades} columnes={columnes} ordre={ordre} onOrdenar={ordenar} etiqueta="Taula de propostes" />
      )}
      {filtrades.length > 0 && perTanda && grups.map((grup) => (
        <SeccioTanda key={grup.clau} grup={grup} ordre={ordreVisible} onOrdenar={ordenar} columnes={columnes} />
      ))}
      {filtrades.some((f) => f.preuPerDefecte) && (
        <p className="propostes-pendents__nota">* Preu per defecte de la distribuïdora.</p>
      )}
    </>
  );
}

function GestioPropostes({ filtresOberts }) {
  const [dades, setDades] = useState(null);
  const {
    error, falla, reintenta, intent,
  } = useErrorCarrega();

  useEffect(() => {
    Promise.all([
      getDocs(collection(db, 'propostes')),
      llegirOBuit('propostesInternes'),
      llegirOBuit('distribuidores'),
      llegirOBuit('tandes'),
      llegirOBuit('sessions'),
    ]).then(([propostesSnap, internesSnap, distribuidoresSnap, tandesSnap, sessionsSnap]) => {
      setDades({
        propostes: ambId(propostesSnap),
        internes: new Map(internesSnap.docs.map((d) => [d.id, d.data()])),
        distribuidores: new Map(ambId(distribuidoresSnap).map((d) => [d.id, d])),
        tandes: ambId(tandesSnap),
        sessions: ambId(sessionsSnap),
      });
    }, falla);
  }, [intent, falla]);

  if (error) return <ErrorCarrega missatge="No s'han pogut carregar les propostes." onReintenta={reintenta} />;
  if (dades === null) return <Carregant />;
  return <Llistat dades={dades} filtresOberts={filtresOberts} />;
}

export default function PropostesPendents() {
  const [filtresOberts, setFiltresOberts] = useState(false);
  return (
    <PaginaAdmin
      amplada="llista"
      titol="Propostes de programació"
      accions={(
        <>
          <BotoFiltres obert={filtresOberts} onClick={() => setFiltresOberts((v) => !v)} />
          <BotoAfegir to={ROUTES.PROPOSTES_NOVA} etiqueta="Nova proposta" />
        </>
      )}
    >
      <GestioPropostes filtresOberts={filtresOberts} />
    </PaginaAdmin>
  );
}
