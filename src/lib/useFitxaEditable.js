import { useEffect, useRef, useState } from 'react';
import { estatBarra } from './estatDesar';
import useAvisSortida from './useAvisSortida';

const DURADA_DESAT = 2500;
const ERROR_DESAT = "No s'ha pogut desar. Torna-ho a provar.";

const igual = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);

// Cicle d'edició d'una fitxa amb la barra «Desar»: valors, canvis respecte de la línia base, desat i errors.
// `inicial` només es llegeix en muntar; per a recàrregues cal `reinicia(nouInicial)`.
// La UI ha de desactivar «Descartar» mentre `estat === 'desant'`.
export default function useFitxaEditable({ inicial, onDesar, avisSortida = true }) {
  const [base, setBase] = useState(inicial);
  const [valors, setValors] = useState(inicial);
  const [desant, setDesant] = useState(false);
  const [desatRecent, setDesatRecent] = useState(false);
  const [errorDesat, setErrorDesat] = useState(null);
  const [errors, setErrors] = useState({});
  const desantRef = useRef(false);
  const temporitzador = useRef(null);
  const valorsRef = useRef(valors);
  // Cada `reinicia` o desmuntatge invalida els desats en curs: el seu resultat s'ignora.
  const generacio = useRef(0);
  const montat = useRef(false);

  useEffect(() => {
    valorsRef.current = valors;
  }, [valors]);

  useEffect(() => {
    montat.current = true;
    return () => {
      montat.current = false;
      generacio.current += 1;
      clearTimeout(temporitzador.current);
    };
  }, []);

  const claus = [...new Set([...Object.keys(base), ...Object.keys(valors)])];
  const canviats = claus.filter((clau) => !igual(valors[clau], base[clau]));
  const hiHaCanvis = canviats.length > 0;
  const estat = estatBarra({
    desant, error: Boolean(errorDesat) || Object.keys(errors).length > 0, hiHaCanvis, desatRecent,
  });

  useAvisSortida(avisSortida && hiHaCanvis && estat !== 'desant');

  const amagaDesat = () => {
    clearTimeout(temporitzador.current);
    setDesatRecent(false);
  };

  const canvia = (clau, valor) => {
    amagaDesat();
    setErrorDesat(null);
    setErrors((e) => {
      if (!(clau in e)) return e;
      const { [clau]: _, ...resta } = e;
      return resta;
    });
    setValors((v) => ({ ...v, [clau]: valor }));
  };

  const desa = async () => {
    if (desantRef.current || !hiHaCanvis) return;
    desantRef.current = true;
    const instantania = valors;
    const meva = generacio.current;
    amagaDesat();
    setDesant(true);
    setErrorDesat(null);
    setErrors({});
    try {
      const resultat = await onDesar({ valors: instantania, canviats });
      if (meva !== generacio.current) return;
      if (resultat?.errors && Object.keys(resultat.errors).length > 0) {
        // Un camp editat mentre es desava ja no té el valor que ha fallat: el seu error no s'aplica.
        const actuals = valorsRef.current;
        setErrors(Object.fromEntries(Object.entries(resultat.errors)
          .filter(([clau]) => igual(actuals[clau], instantania[clau]))));
        return;
      }
      // El desat és la nova línia base; el que s'hagi escrit mentre es desava continua pendent.
      setBase(instantania);
      setDesatRecent(true);
      temporitzador.current = setTimeout(() => setDesatRecent(false), DURADA_DESAT);
    } catch {
      if (meva === generacio.current) setErrorDesat(ERROR_DESAT);
    } finally {
      desantRef.current = false;
      if (montat.current) setDesant(false);
    }
  };

  const neteja = () => {
    amagaDesat();
    setErrorDesat(null);
    setErrors({});
  };

  const descarta = () => {
    neteja();
    setValors(base);
  };

  const reinicia = (nouInicial) => {
    generacio.current += 1;
    neteja();
    setBase(nouInicial);
    setValors(nouInicial);
  };

  return {
    valors, canvia, canviats, hiHaCanvis, estat, desa, descarta, errorDesat, errors, setErrors, reinicia,
  };
}
