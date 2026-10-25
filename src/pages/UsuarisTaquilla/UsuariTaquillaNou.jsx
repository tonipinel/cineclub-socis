import { useState } from 'react';
import { Link } from 'react-router-dom';
import * as ROUTES from '../../constants/routes';
import EnllacContrasenya from '../../components/EnllacContrasenya';
import PaginaAdmin from '../../components/PaginaAdmin';
import {
  codiError, crearUsuari, missatgeError, validarUsuari,
} from '../../lib/usuarisTaquilla';

const TITOL = 'Nou usuari de taquilla';
const TORNAR = { to: ROUTES.USUARIS_TAQUILLA, etiqueta: 'Usuaris de taquilla' };
const ERROR_CREAR = "No s'ha pogut crear l'usuari. Torna-ho a provar.";

const atributsError = (errors, camp) => (errors[camp]
  ? { 'aria-invalid': true, 'aria-describedby': `${camp}-error` }
  : {});

// Alta amb un botó explícit (i no la barra «Desar»): crear el compte envia un correu i no es pot «descartar».
export default function UsuariTaquillaNou() {
  const [valors, setValors] = useState({ nom: '', correu: '' });
  const [errors, setErrors] = useState({});
  const [errorGeneral, setErrorGeneral] = useState(null);
  const [creant, setCreant] = useState(false);
  const [creat, setCreat] = useState(null);

  const canvia = (camp, valor) => {
    setValors((v) => ({ ...v, [camp]: valor }));
    setErrors(({ [camp]: _, ...resta }) => resta);
    setErrorGeneral(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (creant) return;
    const errorsValidacio = validarUsuari(valors);
    setErrors(errorsValidacio);
    setErrorGeneral(null);
    const primer = Object.keys(errorsValidacio)[0];
    if (primer) {
      document.getElementById(primer)?.focus();
      return;
    }
    setCreant(true);
    try {
      const dades = { nom: valors.nom.trim(), correu: valors.correu.trim().toLowerCase() };
      const resultat = await crearUsuari(dades);
      setCreat({ ...resultat, correu: dades.correu });
    } catch (error) {
      if (codiError(error) === 'already-exists') {
        setErrors({ correu: missatgeError(error) });
        document.getElementById('correu')?.focus();
      } else setErrorGeneral(missatgeError(error, ERROR_CREAR));
    } finally {
      setCreant(false);
    }
  };

  if (creat) {
    return (
      <PaginaAdmin amplada="formulari" titol={TITOL} tornar={TORNAR}>
        <p className="usuaris-taquilla__fet" role="status">S&apos;ha creat l&apos;usuari de taquilla.</p>
        <EnllacContrasenya correu={creat.correu} enllac={creat.enllac} correuEnviat={creat.correuEnviat} />
        <div className="usuaris-taquilla__enllacos">
          <Link className="enllac" to={ROUTES.USUARIS_TAQUILLA_EDITAR.replace(':uid', creat.uid)}>Veure la fitxa de l&apos;usuari</Link>
          <Link className="enllac" to={ROUTES.USUARIS_TAQUILLA}>Torna als usuaris de taquilla</Link>
        </div>
      </PaginaAdmin>
    );
  }

  return (
    <PaginaAdmin
      as="form"
      amplada="formulari"
      className="usuaris-taquilla__form"
      titol={TITOL}
      tornar={TORNAR}
      onSubmit={handleSubmit}
      noValidate
    >
      <p className="usuaris-taquilla__ajuda">
        Només podrà fer servir l&apos;escaneig de carnets. Rebrà un correu amb un enllaç per triar la seva contrasenya.
      </p>
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
          {...atributsError(errors, 'correu')}
        />
        {errors.correu && <p id="correu-error" className="form__error">{errors.correu}</p>}
      </div>
      {errorGeneral && <p className="form__error" role="alert">{errorGeneral}</p>}
      <div className="usuaris-taquilla__enviar">
        <button type="submit" className="btn" disabled={creant}>{creant ? 'Creant l\'usuari…' : 'Crea l\'usuari'}</button>
      </div>
    </PaginaAdmin>
  );
}
