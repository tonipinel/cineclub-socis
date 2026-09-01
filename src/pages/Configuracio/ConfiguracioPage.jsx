import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import Carregant from '../../components/Carregant';
import BotoEditar from '../../components/BotoEditar';

const CAMPS_INICIALS = { quotaAnual: '30', numeroCompte: '' };

const CAMPS_FORMULARI = [
  ['quotaAnual', 'Quota anual (€)', 'number'],
  ['numeroCompte', 'Número de compte (IBAN)', 'text'],
];

export default function ConfiguracioPage() {
  const [dades, setDades] = useState(CAMPS_INICIALS);
  const [carregant, setCarregant] = useState(true);
  const [error, setError] = useState(null);
  const [desat, setDesat] = useState(false);
  const [desbloquejat, setDesbloquejat] = useState(false);

  useEffect(() => {
    getDoc(doc(db, 'configuracio', 'associacio')).then((snap) => {
      if (snap.exists()) setDades({ ...CAMPS_INICIALS, ...snap.data() });
      setCarregant(false);
    });
  }, []);

  const handleChange = (camp) => (e) => {
    setDesat(false);
    setDades((d) => ({ ...d, [camp]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await setDoc(doc(db, 'configuracio', 'associacio'), {
        ...dades,
        quotaAnual: Number(dades.quotaAnual) || 0,
      });
      setDesbloquejat(false);
      setDesat(true);
    } catch {
      setError("No s'ha pogut desar. Torna-ho a provar.");
    }
  };

  if (carregant) return <Carregant />;

  return (
    <form className="configuracio-form" onSubmit={handleSubmit}>
      <div className="configuracio-form__capcalera">
        <h1 className="configuracio-form__titol">Configuració de l'associació</h1>
        {!desbloquejat && <BotoEditar onClick={() => setDesbloquejat(true)} />}
      </div>

      <p className="configuracio-form__ajuda">
        Aquestes dades s'utilitzen, per exemple, al correu de benvinguda que reben les noves sol·licituds d'alta.
      </p>

      {CAMPS_FORMULARI.map(([camp, etiqueta, tipus]) => (
        <div className="form__field" key={camp}>
          <label className="form__label" htmlFor={camp}>{etiqueta}</label>
          <input
            id={camp}
            type={tipus}
            className={desbloquejat ? 'form__input' : 'form__input form__input--nomes-lectura'}
            value={dades[camp] ?? ''}
            onChange={handleChange(camp)}
            readOnly={!desbloquejat}
          />
        </div>
      ))}

      {error && <p className="form__error">{error}</p>}
      {desat && <p className="configuracio-form__confirmacio">Desat correctament.</p>}

      {desbloquejat && <button className="btn" type="submit">Desar</button>}
    </form>
  );
}
