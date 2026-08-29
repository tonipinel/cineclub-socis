import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { addDoc, collection, doc, getDoc, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import * as ROUTES from '../../constants/routes';
import { properNumeroSoci } from '../../lib/numeroSoci';
import { teNumeroSoci } from '../../lib/socis';

const CAMPS_INICIALS = {
  numeroSoci: '', nom: '', cognoms: '', poblacio: '', codiPostal: '',
  telefon: '', correuElectronic: '', dni: '', grupWhatsapp: '',
};

const CAMPS_FORMULARI = [
  ['nom', 'Nom'],
  ['cognoms', 'Cognoms'],
  ['poblacio', 'Població'],
  ['codiPostal', 'Codi postal'],
  ['telefon', 'Telèfon'],
  ['correuElectronic', 'Correu electrònic'],
  ['dni', 'DNI'],
  ['grupWhatsapp', 'Grup WhatsApp'],
];

function avui() {
  return new Date().toISOString().slice(0, 10);
}

export default function SociForm() {
  const { id } = useParams();
  const editant = Boolean(id);
  const [dades, setDades] = useState(CAMPS_INICIALS);
  const [carregant, setCarregant] = useState(editant);
  const [error, setError] = useState(null);
  const [desbloquejat, setDesbloquejat] = useState(!editant);
  const navigate = useNavigate();

  useEffect(() => {
    if (!editant) return;
    getDoc(doc(db, 'socis', id)).then((snap) => {
      setDades({ ...CAMPS_INICIALS, ...snap.data() });
      setCarregant(false);
    });
  }, [id, editant]);

  const handleChange = (camp) => (e) => {
    setDades((d) => ({ ...d, [camp]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      if (editant) {
        await updateDoc(doc(db, 'socis', id), dades);
      } else {
        const data = avui();
        await addDoc(collection(db, 'socis'), {
          ...dades,
          dataAlta: data,
          ultimPagament: data,
          actiu: true,
        });
      }
      navigate(ROUTES.SOCIS);
    } catch {
      setError("No s'ha pogut desar. Torna-ho a provar.");
    }
  };

  const handleRegistrarPagament = async () => {
    const confirmat = window.confirm(
      "Confirmes que has rebut el pagament d'avui? Aquesta acció no es pot desfer."
    );
    if (!confirmat) return;
    setError(null);
    try {
      const data = avui();
      const actualitzacio = { ultimPagament: data, estatManual: null };
      if (!dades.numeroSoci) {
        const socisExistents = await getDocs(collection(db, 'socis'));
        actualitzacio.numeroSoci = properNumeroSoci(socisExistents.docs.map((d) => d.data().numeroSoci));
      }
      await updateDoc(doc(db, 'socis', id), actualitzacio);
      setDades((d) => ({ ...d, ...actualitzacio }));
    } catch {
      setError("No s'ha pogut desar. Torna-ho a provar.");
    }
  };

  if (carregant) return <p>Carregant…</p>;

  return (
    <form className="soci-form" onSubmit={handleSubmit}>
      <div className="soci-form__capcalera">
        <h1 className="soci-form__titol">{editant ? 'Fitxa del soci/a' : "Donar d'alta un/a soci/a"}</h1>
        {editant && !desbloquejat && (
          <button type="button" className="btn btn--outline" onClick={() => setDesbloquejat(true)}>
            Editar dades
          </button>
        )}
      </div>

      {editant && (
        <p className="soci-form__numero">
          Número de soci/a: {dades.numeroSoci || "pendent d'assignar"}
        </p>
      )}

      {CAMPS_FORMULARI.map(([camp, etiqueta]) => (
        <div className="form__field" key={camp}>
          <label className="form__label" htmlFor={camp}>{etiqueta}</label>
          <input
            id={camp}
            className={desbloquejat ? 'form__input' : 'form__input form__input--nomes-lectura'}
            value={dades[camp] ?? ''}
            onChange={handleChange(camp)}
            readOnly={!desbloquejat}
          />
        </div>
      ))}

      {error && <p className="form__error">{error}</p>}

      {desbloquejat && <button className="btn" type="submit">Desar</button>}
      {editant && (
        <button className="btn btn--outline" type="button" onClick={handleRegistrarPagament}>
          Registrar pagament d'avui
        </button>
      )}
      {editant && teNumeroSoci(dades) && (
        <Link className="btn btn--outline" to={ROUTES.SOCIS_CARNET.replace(':id', id)}>
          Veure i imprimir el carnet
        </Link>
      )}
    </form>
  );
}
