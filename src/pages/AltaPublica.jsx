import { useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { validarSolicitud } from '../lib/solicitud';

const ESTAT_INICIAL = {
  nom: '', cognoms: '', poblacio: '', codiPostal: '', telefon: '',
  correuElectronic: '', comentaris: '',
  acceptaPrivacitat: false, acceptaDadesPersonals: false,
};

export default function AltaPublica() {
  const [dades, setDades] = useState(ESTAT_INICIAL);
  const [errors, setErrors] = useState({});
  const [enviant, setEnviant] = useState(false);
  const [enviat, setEnviat] = useState(false);

  const handleChange = (camp) => (e) => {
    const valor = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setDades((d) => ({ ...d, [camp]: valor }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errorsValidacio = validarSolicitud(dades);
    setErrors(errorsValidacio);
    if (Object.keys(errorsValidacio).length > 0) return;
    setEnviant(true);
    await addDoc(collection(db, 'solicituds'), {
      ...dades,
      timestamp: serverTimestamp(),
      estat: 'pendent',
    });
    setEnviant(false);
    setEnviat(true);
  };

  if (enviat) {
    return (
      <div className="alta-publica">
        <p className="alta-publica__confirmacio">
          Gràcies! Hem rebut la teva sol·licitud. En breu ens posarem en contacte per confirmar l'alta.
        </p>
      </div>
    );
  }

  return (
    <form className="alta-publica" onSubmit={handleSubmit} noValidate>
      <h1 className="alta-publica__titol">Alta soci/a</h1>
      <p className="alta-publica__avis">
        IMPORTANT: Per completar l'alta, cal omplir aquest formulari i després fer una
        transferència de 30€ al compte que t'enviarem per e-mail o pagar la quota en mà
        a la propera sessió.
      </p>

      <div className="form__field">
        <label className="form__label" htmlFor="correuElectronic">Correu electrònic (opcional però recomanat)</label>
        <input id="correuElectronic" className="form__input" type="email"
          value={dades.correuElectronic} onChange={handleChange('correuElectronic')} />
      </div>

      <div className="form__field">
        <label className="form__label" htmlFor="nom">Nom *</label>
        <input id="nom" className="form__input" value={dades.nom} onChange={handleChange('nom')} />
        {errors.nom && <p className="form__error">{errors.nom}</p>}
      </div>

      <div className="form__field">
        <label className="form__label" htmlFor="cognoms">Cognoms *</label>
        <input id="cognoms" className="form__input" value={dades.cognoms} onChange={handleChange('cognoms')} />
        {errors.cognoms && <p className="form__error">{errors.cognoms}</p>}
      </div>

      <div className="form__field">
        <label className="form__label" htmlFor="poblacio">Població *</label>
        <input id="poblacio" className="form__input" value={dades.poblacio} onChange={handleChange('poblacio')} />
        {errors.poblacio && <p className="form__error">{errors.poblacio}</p>}
      </div>

      <div className="form__field">
        <label className="form__label" htmlFor="codiPostal">Codi postal *</label>
        <input id="codiPostal" className="form__input" value={dades.codiPostal} onChange={handleChange('codiPostal')} />
        {errors.codiPostal && <p className="form__error">{errors.codiPostal}</p>}
      </div>

      <div className="form__field">
        <label className="form__label" htmlFor="telefon">Telèfon *</label>
        <input id="telefon" className="form__input" value={dades.telefon} onChange={handleChange('telefon')} />
        {errors.telefon && <p className="form__error">{errors.telefon}</p>}
      </div>

      <div className="form__field">
        <label className="form__label" htmlFor="comentaris">Comentaris</label>
        <textarea id="comentaris" className="form__input" value={dades.comentaris} onChange={handleChange('comentaris')} />
      </div>

      <div className="form__field form__field--checkbox">
        <label className="form__checkbox-label">
          <input type="checkbox" checked={dades.acceptaPrivacitat} onChange={handleChange('acceptaPrivacitat')} />
          He llegit i accepto la{' '}
          <a href="https://www.cineclubrodadebera.cat/privacitat" target="_blank" rel="noopener noreferrer">
            política de privacitat
          </a>.
        </label>
        {errors.acceptaPrivacitat && <p className="form__error">{errors.acceptaPrivacitat}</p>}
      </div>

      <div className="form__field form__field--checkbox">
        <label className="form__checkbox-label">
          <input type="checkbox" checked={dades.acceptaDadesPersonals} onChange={handleChange('acceptaDadesPersonals')} />
          Autoritzo el tractament de les meves dades per a la gestió com a soci/a.
        </label>
        {errors.acceptaDadesPersonals && <p className="form__error">{errors.acceptaDadesPersonals}</p>}
      </div>

      <button className="btn" type="submit" disabled={enviant}>
        {enviant ? 'Enviant…' : 'Enviar sol·licitud'}
      </button>
    </form>
  );
}
