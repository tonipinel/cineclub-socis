import { useEffect, useRef, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import BarraDesar from '../../components/BarraDesar';
import Carregant from '../../components/Carregant';
import PaginaAdmin from '../../components/PaginaAdmin';
import ErrorCarrega from '../../components/ErrorCarrega';
import useErrorCarrega from '../../lib/useErrorCarrega';
import useFitxaEditable from '../../lib/useFitxaEditable';

const QUOTA_PER_DEFECTE = '30';
const ERROR_CARREGA = "No s'ha pogut carregar la configuració.";
const ERROR_QUOTA = 'La quota ha de ser un número igual o superior a 0.';

// Valida la quota: en blanc, no numèrica o negativa és un error (abans es desava com a 0 sense avisar).
// Sense validació nativa, un text que el navegador no pot llegir com a número («12e») arriba com a ''.
const validarQuota = (text, illegible) => {
  if (illegible || !String(text).trim()) return ERROR_QUOTA;
  const quota = Number(text);
  return Number.isFinite(quota) && quota >= 0 ? null : ERROR_QUOTA;
};

function FitxaConfiguracio({ dadesDesades }) {
  // Camps que el formulari no coneix, però que són al document: es tornen a escriure tal qual.
  const { quotaAnual, numeroCompte, ...extres } = dadesDesades;
  const [inicial] = useState(() => ({
    quotaAnual: String(quotaAnual ?? QUOTA_PER_DEFECTE),
    numeroCompte: numeroCompte ?? '',
  }));
  const quotaRef = useRef(null);

  const onDesar = async ({ valors: v }) => {
    const motiu = validarQuota(v.quotaAnual, quotaRef.current?.validity?.badInput);
    if (motiu) return { errors: { quotaAnual: motiu } };
    await setDoc(doc(db, 'configuracio', 'associacio'), {
      ...extres,
      quotaAnual: Number(v.quotaAnual),
      numeroCompte: v.numeroCompte.trim(),
    });
    return undefined;
  };

  const {
    valors, canvia, estat, desa, descarta, errorDesat, errors,
  } = useFitxaEditable({ inicial, onDesar });

  const handleSubmit = (e) => {
    e.preventDefault();
    desa();
  };

  const errorsBarra = errors.quotaAnual
    ? [{ pestanya: 'quotaAnual', etiquetaPestanya: 'Quota anual', missatge: errors.quotaAnual }]
    : [];

  return (
    <PaginaAdmin
      as="form"
      amplada="formulari"
      ambBarra
      className="configuracio-form"
      onSubmit={handleSubmit}
      noValidate
      titol="Configuració de l'associació"
    >
      <p className="configuracio-form__ajuda">
        Aquestes dades s'utilitzen, per exemple, al correu de benvinguda que reben les noves sol·licituds d'alta.
      </p>

      <div className="form__field">
        <label className="form__label" htmlFor="quotaAnual">Quota anual (€)</label>
        <input
          id="quotaAnual"
          ref={quotaRef}
          type="number"
          step="any"
          min="0"
          className="form__input"
          value={valors.quotaAnual}
          onChange={(e) => canvia('quotaAnual', e.target.value)}
          aria-invalid={errors.quotaAnual ? true : undefined}
          aria-describedby={errors.quotaAnual ? 'quotaAnual-error' : undefined}
        />
        {errors.quotaAnual && <p id="quotaAnual-error" className="form__error">{errors.quotaAnual}</p>}
      </div>
      <div className="form__field">
        <label className="form__label" htmlFor="numeroCompte">Número de compte (IBAN)</label>
        <input
          id="numeroCompte"
          type="text"
          className="form__input"
          value={valors.numeroCompte}
          onChange={(e) => canvia('numeroCompte', e.target.value)}
        />
      </div>

      <BarraDesar
        estat={estat}
        errors={errorsBarra}
        onAnarA={(nom) => document.getElementById(nom)?.focus()}
        onDescarta={descarta}
        missatgeError={errorDesat}
      />
    </PaginaAdmin>
  );
}

// La fitxa es munta quan hi ha les dades (el hook només llegeix `inicial` en muntar).
export default function ConfiguracioPage() {
  const [dadesDesades, setDadesDesades] = useState(null);
  const {
    error: errorCarrega, falla, reintenta, intent,
  } = useErrorCarrega();

  useEffect(() => {
    let actiu = true;
    getDoc(doc(db, 'configuracio', 'associacio')).then((snap) => {
      if (actiu) setDadesDesades(snap.exists() ? snap.data() : {});
    }).catch((e) => { if (actiu) falla(e); });
    return () => { actiu = false; };
  }, [intent, falla]);

  if (errorCarrega) {
    return (
      <PaginaAdmin amplada="formulari" titol="Configuració de l'associació">
        <ErrorCarrega missatge={ERROR_CARREGA} onReintenta={reintenta} />
      </PaginaAdmin>
    );
  }
  if (!dadesDesades) return <Carregant />;
  return <FitxaConfiguracio dadesDesades={dadesDesades} />;
}
