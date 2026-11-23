import {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  collection, deleteField, doc, getDocs, updateDoc,
} from 'firebase/firestore';
import { flushSync } from 'react-dom';
import { db } from '../../firebase/firebase';
import BarraDesar from '../../components/BarraDesar';
import Carregant from '../../components/Carregant';
import ErrorCarrega from '../../components/ErrorCarrega';
import PaginaAdmin from '../../components/PaginaAdmin';
import Pestanyes from '../../components/Pestanyes';
import TextareaAutomatic from '../../components/TextareaAutomatic';
import { avui } from '../../lib/data';
import { dataValida } from '../../lib/sessioPublica';
import {
  AVIS_CURIOSITAT, MAX_CURIOSITAT, MAX_PROGRAMACIO, curiositatsADesar, curiositatsDe, descarrega, diapositivaObertura, diapositivaTancamentProgramacio, diapositivesPelicula,
  exportaPng, htmlAText, imatgeAData, esFilmoxarxa, logoDistribuidora, logosEntitats, maxCuriositats, nomFitxer, retallaMarges, urlsDiapositiva,
} from '../../lib/social';
import useAvisSortida from '../../lib/useAvisSortida';
import useErrorCarrega from '../../lib/useErrorCarrega';
import Diapositiva from './Diapositiva';
import TriaSessions from './TriaSessions';

const ERROR_IMATGES = "No s'han pogut carregar les imatges. Cal permetre l'accés (CORS) del bucket de Storage per poder-les exportar.";
const ERROR_EXPORTA = "No s'ha pogut generar la imatge.";
const ERROR_COPIA = "No s'ha pogut copiar el text.";
const ERROR_DESA = "No s'han pogut desar les curiositats.";
const llistaIgual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const SENSE_IMATGES = 'No es poden afegir més curiositats perquè no hi ha més imatges a la galeria.';

// Markdown → HTML sanejat (com la vista prèvia de la fitxa de la sessió). Es carrega només quan cal.
async function renderitza(cos) {
  const [{ marked }, { default: DOMPurify }] = await Promise.all([import('marked'), import('dompurify')]);
  return DOMPurify.sanitize(await marked.parse(cos));
}
const PESTANYES = [{ id: 'programacio', etiqueta: 'Programació' }, { id: 'pelicula', etiqueta: 'Pel·lícula' }];

const titolDe = (s) => s.publica?.titol || s.titol;
const etiquetaDiapositiva = (d, i) => {
  if (d.tipus === 'portada-pelicula') return 'Portada';
  if (d.tipus === 'tancament') return 'Tancament';
  return `Curiositat ${i}`;
};

export default function SocialMedia() {
  const [dades, setDades] = useState(null);
  const [tipus, setTipus] = useState('programacio');
  const [sessioId, setSessioId] = useState('');
  const [seleccio, setSeleccio] = useState([]);
  const [imatges, setImatges] = useState({});
  const [errorDescarrega, setErrorDescarrega] = useState('');
  const [generant, setGenerant] = useState(false);
  const [copiat, setCopiat] = useState(false);
  const [esborranys, setEsborranys] = useState({});
  const [desant, setDesant] = useState(false);
  // Resultat del darrer desat, lligat a la sessió desada (en triar-ne una altra la barra torna a «Sense canvis»).
  const [resultatDesa, setResultatDesa] = useState({ id: '', estat: '' });
  const [renderitzat, setRenderitzat] = useState({ cos: '', html: '' });
  const promeses = useRef(new Map());
  const nodes = useRef({});
  const {
    error, falla, reintenta, intent,
  } = useErrorCarrega();

  useEffect(() => {
    Promise.all([
      getDocs(collection(db, 'sessions')), getDocs(collection(db, 'entitats')), getDocs(collection(db, 'distribuidores')),
    ]).then(([sessionsSnap, entitatsSnap, distribuidoresSnap]) => {
      const sessions = sessionsSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .filter((s) => dataValida(s.data))
        .sort((a, b) => a.data.localeCompare(b.data));
      const entitats = entitatsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const properes = sessions.filter((s) => s.data >= avui());
      const distribuidores = distribuidoresSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setDades({ sessions, entitats, distribuidores });
      setSeleccio(properes.slice(0, MAX_PROGRAMACIO).map((s) => s.id));
      setSessioId(properes[0]?.id ?? '');
    }).catch(falla);
  }, [intent, falla]);

  const sessions = dades?.sessions;
  const entitats = useMemo(() => dades?.entitats ?? [], [dades]);
  const distribuidores = useMemo(() => dades?.distribuidores ?? [], [dades]);
  // Col·laboradors (que no són el Cineclub) i distribuïdora d'una sessió, per al peu de la portada.
  const peuDe = useCallback((sessio) => ({
    logos: logosEntitats(sessio, entitats),
    distribuidora: logoDistribuidora(sessio, distribuidores),
    filmoxarxa: esFilmoxarxa(sessio, distribuidores),
  }), [entitats, distribuidores]);
  const sessioPelicula = sessions?.find((s) => s.id === sessioId);

  // Les curiositats que s'estan editant (esborrany) o, si no s'hi ha tocat res, les desades a la sessió.
  const desades = useMemo(() => curiositatsDe(sessioPelicula), [sessioPelicula]);
  const curiositats = esborranys[sessioId] ?? desades;
  const canvis = !llistaIgual(curiositats, desades);
  const hiHaCanvis = Object.entries(esborranys).some(([id, llista]) => !llistaIgual(llista, curiositatsDe(sessions?.find((s) => s.id === id))));
  const desat = resultatDesa.id === sessioId && resultatDesa.estat === 'desat';
  const errorDesa = resultatDesa.id === sessioId && resultatDesa.estat === 'error';
  useAvisSortida(hiHaCanvis);

  const cos = sessioPelicula?.publica?.cos ?? '';
  useEffect(() => {
    let actiu = true;
    if (cos.trim()) renderitza(cos).then((html) => { if (actiu) setRenderitzat({ cos, html }); });
    return () => { actiu = false; };
  }, [cos]);
  // Fins que no s'ha renderitzat el text actual no es mostra res (ni es pot copiar).
  const htmlCos = renderitzat.cos === cos ? renderitzat.html : '';

  const sessioEditada = useMemo(
    () => sessioPelicula && { ...sessioPelicula, publica: { ...sessioPelicula.publica, curiositats } },
    [sessioPelicula, curiositats],
  );

  const diapositives = useMemo(() => {
    if (!sessions) return [];
    if (tipus === 'pelicula') {
      if (!sessioEditada) return [];
      return diapositivesPelicula(sessioEditada).map((d, i) => ({
        clau: `pelicula-${sessioEditada.id}-${i}`, etiqueta: etiquetaDiapositiva(d, i), sessio: sessioEditada, tipus: 'pelicula', n: i, diapositiva: d,
        ...peuDe(sessioEditada),
      }));
    }
    const triades = sessions.filter((s) => seleccio.includes(s.id));
    if (triades.length === 0) return [];
    const pseudo = { data: triades[0].data, publica: {} };
    // Primera diapositiva: mosaic de fotogrames (que no són els del tancament) i el rang de dates.
    const obertura = {
      clau: 'programacio-obertura',
      etiqueta: 'Obertura',
      sessio: { ...pseudo, slug: 'obertura' },
      tipus: 'programacio',
      n: 0,
      diapositiva: diapositivaObertura(triades),
      logos: [],
      distribuidora: null,
    };
    const portades = triades.map((s, i) => ({
      clau: `programacio-${s.id}`, etiqueta: titolDe(s), sessio: s, tipus: 'programacio', n: i + 1, diapositiva: { tipus: 'portada-programacio' }, ...peuDe(s),
    }));
    // Última diapositiva: el lloc i la invitació, com la de tancament d'una pel·lícula.
    const tancament = {
      clau: 'programacio-tancament',
      etiqueta: 'Tancament',
      sessio: { ...pseudo, slug: 'tancament' },
      tipus: 'programacio',
      n: triades.length + 1,
      diapositiva: diapositivaTancamentProgramacio(triades),
      logos: [],
      distribuidora: null,
    };
    return [obertura, ...portades, tancament];
  }, [sessions, tipus, sessioEditada, seleccio, peuDe]);

  // Cada URL es baixa un sol cop; la promesa es guarda perquè la descàrrega pugui esperar-la.
  // Els logos també se'n retallen els marges buits, perquè omplin la seva caixa.
  const assegura = useCallback((url, logo = false) => {
    if (!promeses.current.has(url)) {
      const promesa = logo ? imatgeAData(url).then(retallaMarges) : imatgeAData(url);
      promeses.current.set(url, promesa);
      promesa.then((dataUrl) => setImatges((actuals) => ({ ...actuals, [url]: dataUrl })))
        .catch(() => promeses.current.delete(url)); // una imatge que falla es pot tornar a provar
    }
    return promeses.current.get(url);
  }, []);

  useEffect(() => {
    diapositives.forEach((d) => {
      const logos = [...d.logos, d.distribuidora].filter(Boolean);
      urlsDiapositiva(d.sessio, d.diapositiva, logos).forEach((url) => assegura(url, logos.includes(url)));
    });
  }, [diapositives, assegura]);

  const baixa = useCallback(async (d) => {
    try {
      const logos = [...d.logos, d.distribuidora].filter(Boolean);
      const urls = urlsDiapositiva(d.sessio, d.diapositiva, logos);
      const convertides = await Promise.all(urls.map((url) => assegura(url, logos.includes(url))));
      // Es pinten ara mateix (sense esperar el proper cicle de React) perquè l'exportació ja les trobi com a data:
      flushSync(() => setImatges((actuals) => ({ ...actuals, ...Object.fromEntries(urls.map((url, i) => [url, convertides[i]])) })));
    } catch {
      setErrorDescarrega(ERROR_IMATGES);
      return false;
    }
    try {
      descarrega(await exportaPng(nodes.current[d.clau]), nomFitxer({ sessio: d.sessio, tipus: d.tipus, n: d.n }));
      return true;
    } catch {
      setErrorDescarrega(ERROR_EXPORTA);
      return false;
    }
  }, [assegura]);

  const baixaUna = async (d) => {
    setErrorDescarrega('');
    setGenerant(true);
    await baixa(d);
    setGenerant(false);
  };

  const baixaTot = async () => {
    setErrorDescarrega('');
    setGenerant(true);
    for (const d of diapositives) {
      if (!(await baixa(d))) break;
    }
    setGenerant(false);
  };

  const alternaSeleccio = (id) => setSeleccio((actual) => (actual.includes(id) ? actual.filter((x) => x !== id) : [...actual, id]));

  const canviaCuriositats = (llista) => {
    setResultatDesa({ id: '', estat: '' });
    setEsborranys((actuals) => ({ ...actuals, [sessioId]: llista }));
  };
  const editaCuriositat = (i, text) => canviaCuriositats(curiositats.map((c, j) => (j === i ? text : c)));
  const esborraCuriositat = (i) => canviaCuriositats(curiositats.filter((_, j) => j !== i));

  const descartaCanvis = () => {
    setResultatDesa({ id: '', estat: '' });
    setEsborranys(({ [sessioId]: _descartat, ...resta }) => resta);
  };

  const desa = async () => {
    setErrorDescarrega('');
    setResultatDesa({ id: '', estat: '' });
    setDesant(true);
    const id = sessioId;
    const llista = curiositatsADesar(curiositats);
    try {
      // Camp propi de la sessió (la fitxa de la sessió mai el reescriu, així que no es pot perdre en desar-la) i es treu el camp antic.
      await updateDoc(doc(db, 'sessions', id), { curiositatsSocial: llista, 'publica.curiositats': deleteField() });
      setDades((actual) => ({
        ...actual,
        sessions: actual.sessions.map((s) => {
          if (s.id !== id) return s;
          const { curiositats: _antigues, ...publica } = s.publica ?? {};
          return { ...s, curiositatsSocial: llista, publica };
        }),
      }));
      setEsborranys(({ [id]: _desat, ...resta }) => resta);
      setResultatDesa({ id, estat: 'desat' });
    } catch {
      setResultatDesa({ id, estat: 'error' });
    }
    setDesant(false);
  };

  const copia = async (text) => {
    setErrorDescarrega('');
    try {
      await navigator.clipboard.writeText(text);
      setCopiat(true);
      setTimeout(() => setCopiat(false), 2500);
    } catch {
      setErrorDescarrega(ERROR_COPIA);
    }
  };

  if (error) return <ErrorCarrega titol="Social media" missatge="No s'han pogut carregar les sessions." onReintenta={reintenta} />;
  if (dades === null) return <Carregant />;

  const maxim = maxCuriositats(sessioPelicula);
  const potAfegir = curiositats.length < maxim;
  // Barra de desar estàndard (com la de les fitxes), només quan s'editen les curiositats d'una sessió.
  const mostraBarra = tipus === 'pelicula' && Boolean(sessioPelicula);
  let estatBarra = 'net';
  if (desant) estatBarra = 'desant';
  else if (errorDesa) estatBarra = 'error';
  else if (canvis) estatBarra = 'pendent';
  else if (desat) estatBarra = 'desat';

  return (
    <PaginaAdmin amplada="llista" titol="Social media" ambBarra={mostraBarra}>
      <div className="social-media">
        <Pestanyes pestanyes={PESTANYES} actual={tipus} onCanvi={setTipus} etiqueta="Tipus de publicació" desactivades={generant || desant} />
        <div role="tabpanel" id={`panell-${tipus}`} aria-labelledby={`pestanya-${tipus}`} className="social-media__panell">
          <section className="social-media__targeta" aria-labelledby="social-sessions">
            <h2 className="social-media__targeta-titol" id="social-sessions">
              {tipus === 'pelicula' ? 'Sessió' : `Sessions (${seleccio.length} de ${MAX_PROGRAMACIO})`}
            </h2>
            <p className="social-media__ajuda">
              {tipus === 'pelicula'
                ? 'Carrusel amb la portada, una diapositiva per cada curiositat i el tancament.'
                : 'Una imatge per sessió. Hi ha marcades les properes sessions; pots desmarcar-ne.'}
            </p>
            {tipus === 'pelicula'
              ? <TriaSessions sessions={sessions} mode="una" triades={sessioId ? [sessioId] : []} onAlterna={setSessioId} desactivat={generant || desant} />
              : (
                <TriaSessions
                  sessions={sessions}
                  mode="multiple"
                  triades={seleccio}
                  onAlterna={alternaSeleccio}
                  max={MAX_PROGRAMACIO}
                  nomesProperes
                  desactivat={generant || desant}
                />
              )}
          </section>

          {errorDescarrega && <p role="alert" className="social-media__alerta social-media__alerta--error">{errorDescarrega}</p>}

          {diapositives.length > 0 && (
            <section className="social-media__targeta" aria-labelledby="social-imatges">
              <div className="social-media__targeta-capcalera">
                <h2 className="social-media__targeta-titol" id="social-imatges">{`Imatges (${diapositives.length})`}</h2>
                <div className="social-media__accions">
                  {tipus === 'pelicula' && (
                    <>
                      <button type="button" className="btn btn--outline social-media__boto" disabled={generant || !potAfegir} onClick={() => canviaCuriositats([...curiositats, ''])}>
                        Afegeix curiositat
                      </button>
                    </>
                  )}
                  <button type="button" className="btn btn--negre social-media__boto" disabled={generant} onClick={baixaTot}>Descarrega-ho tot</button>
                </div>
              </div>
              {tipus === 'pelicula' && !potAfegir && <p className="social-media__alerta">{SENSE_IMATGES}</p>}
              {tipus === 'pelicula' && potAfegir && curiositats.length === 0 && (
                <p className="social-media__alerta">Encara no hi ha curiositats: afegeix-ne amb el botó «Afegeix curiositat». Cadascuna genera una imatge del carrusel.</p>
              )}
              <ul className="social-media__diapositives">
                {diapositives.map((d) => {
                  const ref = (node) => { nodes.current[d.clau] = node; };
                  const peu = {
                    logos: d.logos, distribuidora: d.distribuidora, filmoxarxa: d.filmoxarxa, imatges,
                  };
                  return (
                    <li key={d.clau} className="social-media__item">
                      <div className="social-previa" aria-hidden="true">
                        <div className="social-previa__escala">
                          <Diapositiva ref={ref} sessio={d.sessio} diapositiva={d.diapositiva} {...peu} />
                        </div>
                      </div>
                      <p className="social-media__etiqueta">{d.etiqueta}</p>
                      {d.diapositiva?.tipus === 'curiositat' && (
                        <div className="social-media__curiositat">
                          <TextareaAutomatic
                            mida="curt"
                            aria-label={d.etiqueta}
                            value={d.diapositiva.text}
                            onChange={(e) => editaCuriositat(d.n - 1, e.target.value)}
                          />
                          <p className="social-media__ajuda">{`${d.diapositiva.text.length}/${MAX_CURIOSITAT}`}</p>
                          {d.diapositiva.text.trim().length > MAX_CURIOSITAT && <p className="social-media__avis">{AVIS_CURIOSITAT}</p>}
                        </div>
                      )}
                      <div className="social-media__accions">
                        <button
                          type="button"
                          className="btn btn--outline social-media__boto"
                          disabled={generant || (d.diapositiva?.tipus === 'curiositat' && !d.diapositiva.text.trim())}
                          onClick={() => baixaUna(d)}
                        >
                          Descarrega PNG
                        </button>
                        {d.diapositiva?.tipus === 'curiositat' && (
                          <button
                            type="button"
                            className="btn btn--perill social-media__boto"
                            aria-label={`Esborra la curiositat ${d.n}`}
                            disabled={generant}
                            onClick={() => esborraCuriositat(d.n - 1)}
                          >
                            Esborra
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {tipus === 'pelicula' && sessioPelicula && (
            <section className="social-media__targeta" aria-labelledby="social-cos">
              <h2 className="social-media__targeta-titol" id="social-cos">Text per al peu del post</h2>
              {cos.trim() ? (
                <>
                  <div className="fitxa-sessio__previa-cos" dangerouslySetInnerHTML={{ __html: htmlCos }} />
                  <button type="button" className="btn btn--outline social-media__boto" disabled={!htmlCos} onClick={() => copia(htmlAText(htmlCos))}>
                    {copiat ? 'Copiat' : 'Copia'}
                  </button>
                </>
              ) : <p className="social-media__buit">Aquesta sessió encara no té text llarg.</p>}
            </section>
          )}
        </div>
      </div>
      {mostraBarra && (
        <BarraDesar
          estat={estatBarra}
          onDesar={desa}
          onDescarta={descartaCanvis}
          missatgeError={ERROR_DESA}
          bloquejada={generant}
        />
      )}
    </PaginaAdmin>
  );
}
