import { useCallback, useEffect, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase/firebase';
import { useConfirmacio } from '../../components/ConfirmacioProvider';

const MISSATGES_ERROR = {
  'functions/permission-denied': 'No tens permís per sincronitzar el calendari.',
  'functions/unauthenticated': 'Cal tornar a iniciar la sessió.',
  'functions/unavailable': 'No s\'ha pogut connectar amb el servidor. Torna-ho a provar.',
  'functions/deadline-exceeded': 'La sincronització ha trigat massa. Torna-ho a provar.',
};
const ERROR_GENERIC = 'No s\'ha pogut sincronitzar el calendari. Torna-ho a provar.';
const missatgeError = (e) => MISSATGES_ERROR[e?.code] ?? ERROR_GENERIC;

const SECCIONS = [
  { clau: 'crear', titol: 'Per crear' },
  { clau: 'actualitzar', titol: 'Per actualitzar' },
  { clau: 'esborrar', titol: 'Per esborrar', perill: true },
  { clau: 'placeholdersConservats', titol: 'Placeholders de Hugo conservats' },
];

// Els totals reals (la llista es retalla a 200); si falten, la longitud de la llista.
const comptador = (informe, clau) => informe.totals?.[clau] ?? informe[clau]?.length ?? 0;

// Aplicació en curs en aquesta sessió del navegador (fora del component): si el panell es reobre
// mentre dura, «Aplicar» continua bloquejat fins que acaba.
let aplicacioEnCurs = null;

const esNombre = (n) => Number.isFinite(n);
const textResultat = (data) => {
  const t = data?.totals;
  if (data?.aplicat === true && esNombre(t?.crear) && esNombre(t?.actualitzar) && esNombre(t?.esborrar)) {
    return `Fet: s'han creat ${t.crear}, actualitzat ${t.actualitzar} i esborrat ${t.esborrar} esdeveniments.`;
  }
  return 'Els canvis s\'han aplicat al calendari.';
};
const ERROR_RECARREGA = 'Els canvis s\'han aplicat, però no s\'ha pogut recarregar l\'informe.';

export default function SincronitzarCalendari({ onTancar }) {
  const [informe, setInforme] = useState(null);
  const [carregant, setCarregant] = useState(true);
  const [aplicant, setAplicant] = useState(() => aplicacioEnCurs !== null);
  const [error, setError] = useState('');
  const [resultat, setResultat] = useState('');
  const [peticio, setPeticio] = useState(0);
  const aplicantRef = useRef(aplicacioEnCurs !== null);
  const aplicatRef = useRef(false);
  const dialegRef = useRef(null);
  // Un sol diàleg de confirmació alhora per a «Aplicar».
  const confirmantRef = useRef(false);
  const { confirma } = useConfirmacio();

  // Cada canvi de `peticio` demana l'informe de nou.
  const carregar = useCallback(() => {
    setCarregant(true);
    setError('');
    setPeticio((n) => n + 1);
  }, []);

  useEffect(() => {
    let vigent = true;
    httpsCallable(functions, 'sincronitzarCalendariTot')({ aplicar: false })
      .then(({ data }) => { if (vigent) setInforme(data); })
      .catch((e) => { if (vigent) { setInforme(null); setError(aplicatRef.current ? ERROR_RECARREGA : missatgeError(e)); } })
      .finally(() => { if (vigent) setCarregant(false); });
    return () => { vigent = false; };
  }, [peticio]);

  useEffect(() => {
    const dialeg = dialegRef.current;
    const obridor = document.activeElement;
    dialeg?.focus();
    const alTeclar = (e) => {
      // ESC i Tab dins d'una altra capa modal (el diàleg de confirmació) són seus: no tanquen ni mouen el focus d'aquest panell.
      if (e.target instanceof Element && e.target.closest('dialog[open], [aria-modal="true"]') && !dialeg?.contains(e.target)) return;
      if (e.key === 'Escape') {
        if (!aplicantRef.current) onTancar();
        return;
      }
      if (e.key !== 'Tab' || !dialeg) return;
      const focusables = [...dialeg.querySelectorAll('button:not([disabled])')];
      if (focusables.length === 0) { e.preventDefault(); return; }
      const primer = focusables[0];
      const ultim = focusables[focusables.length - 1];
      if (!dialeg.contains(document.activeElement) || (e.shiftKey && [dialeg, primer].includes(document.activeElement))) {
        e.preventDefault(); ultim.focus();
      } else if (!e.shiftKey && document.activeElement === ultim) {
        e.preventDefault(); primer.focus();
      }
    };
    document.addEventListener('keydown', alTeclar);
    return () => { document.removeEventListener('keydown', alTeclar); obridor?.focus?.(); };
  }, [onTancar]);

  // Si es reobre amb una aplicació en curs, espera que acabi i recarrega l'informe.
  useEffect(() => {
    if (!aplicacioEnCurs) return undefined;
    let vigent = true;
    aplicacioEnCurs.then(() => {
      if (!vigent) return;
      aplicantRef.current = false;
      setAplicant(false);
      setCarregant(true);
      setPeticio((n) => n + 1);
    });
    return () => { vigent = false; };
  }, []);

  const nCrear = informe ? comptador(informe, 'crear') : 0;
  const nActualitzar = informe ? comptador(informe, 'actualitzar') : 0;
  const nEsborrar = informe ? comptador(informe, 'esborrar') : 0;
  const nPlaceholders = informe ? comptador(informe, 'placeholdersConservats') : 0;
  const hiHaCanvis = nCrear + nActualitzar + nEsborrar > 0;

  async function aplicar() {
    if (aplicantRef.current || confirmantRef.current) return;
    confirmantRef.current = true;
    const confirmat = await confirma({
      missatge: `Segur que vols aplicar-ho al calendari de Google? Es crearan ${nCrear}, s'actualitzaran ${nActualitzar} i s'esborraran ${nEsborrar} esdeveniments.`,
      perill: true,
      etiquetaAcceptar: 'Aplica',
    });
    confirmantRef.current = false;
    if (!confirmat || aplicantRef.current) return;
    aplicantRef.current = true;
    aplicatRef.current = false;
    setAplicant(true);
    setError('');
    setResultat('');
    const peticioAplicar = httpsCallable(functions, 'sincronitzarCalendariTot')({ aplicar: true });
    aplicacioEnCurs = peticioAplicar.then(() => {}, () => {}).then(() => { aplicacioEnCurs = null; });
    try {
      const { data } = await peticioAplicar;
      aplicatRef.current = true;
      setResultat(textResultat(data));
    } catch (e) {
      aplicantRef.current = false;
      setAplicant(false);
      setError(missatgeError(e));
      return;
    }
    aplicantRef.current = false;
    setAplicant(false);
    carregar();
  }

  return (
    <div className="sincro__fons">
      <div
        ref={dialegRef}
        className="sincro"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sincro-titol"
        tabIndex={-1}
      >
        <div className="sincro__capcalera">
          <h2 id="sincro-titol" className="sincro__titol">Sincronitzar el calendari</h2>
          <button type="button" className="sincro__tancar" onClick={onTancar} disabled={aplicant} aria-label="Tancar el diàleg">×</button>
        </div>

        {carregant && <p className="sincro__estat" role="status">{informe ? 'Actualitzant l\'informe…' : 'Carregant l\'informe…'}</p>}
        {aplicant && <p className="sincro__estat" role="status">S'està aplicant, no tanquis la finestra…</p>}

        {error && (
          <div className="sincro__error" role="alert">
            <p>{error}</p>
            <button type="button" className="btn btn--outline" onClick={carregar} disabled={carregant}>Tornar a provar</button>
          </div>
        )}

        {resultat && <p className="sincro__resultat" role="status">{resultat}</p>}

        {informe && (
          <>
            <p className="sincro__resum">
              {nCrear} per crear · {nActualitzar} per actualitzar · {nEsborrar} per esborrar · {nPlaceholders} placeholders de Hugo conservats · {informe.noGestionats ?? 0} no gestionats · {informe.sessionsOmeses?.length ?? 0} sessions omeses
            </p>
            {!hiHaCanvis && <p className="sincro__ok">Tot sincronitzat</p>}
            {SECCIONS.map(({ clau, titol, perill }) => (informe[clau]?.length ? (
              <section key={clau} className={`sincro__seccio ${perill ? 'sincro__seccio--perill' : ''}`}>
                <h3 className="sincro__subtitol">{titol}</h3>
                {perill && <p className="sincro__avis">Revisa-ho: s'esborraran d'aquest calendari</p>}
                {comptador(informe, clau) > informe[clau].length && (
                  <p className="sincro__estat">Es mostren només els primers {informe[clau].length}.</p>
                )}
                <ul className="sincro__llista">
                  {informe[clau].map((text, i) => <li key={`${clau}-${i}`}>{text}</li>)}
                </ul>
              </section>
            ) : null))}
            {informe.sessionsOmeses?.length > 0 && (
              <section className="sincro__seccio">
                <h3 className="sincro__subtitol">Sessions omeses</h3>
                <ul className="sincro__llista">
                  {informe.sessionsOmeses.map((id) => <li key={id}>{id}</li>)}
                </ul>
              </section>
            )}
          </>
        )}

        <div className="sincro__accions">
          <button type="button" className="btn btn--outline" onClick={onTancar} disabled={aplicant}>Tancar</button>
          <button
            type="button"
            className="btn"
            onClick={aplicar}
            disabled={!informe || !hiHaCanvis || aplicant || carregant}
          >
            {aplicant ? 'Aplicant…' : 'Aplicar els canvis'}
          </button>
        </div>
      </div>
    </div>
  );
}
