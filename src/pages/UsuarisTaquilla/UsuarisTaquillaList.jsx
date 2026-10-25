import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as ROUTES from '../../constants/routes';
import BotoAfegir from '../../components/BotoAfegir';
import Carregant from '../../components/Carregant';
import EnllacContrasenya from '../../components/EnllacContrasenya';
import PaginaAdmin from '../../components/PaginaAdmin';
import {
  filtrarUsuaris, formatData, llistarUsuaris, missatgeError,
} from '../../lib/usuarisTaquilla';
import AccionsUsuari from './AccionsUsuari';
import useAccionsUsuari from './useAccionsUsuari';

const TITOL = 'Usuaris de taquilla';
const ERROR_CARREGA = "No s'han pogut carregar els usuaris de taquilla. Torna-ho a provar.";

export default function UsuarisTaquillaList() {
  const [usuaris, setUsuaris] = useState(null);
  const [errorCarrega, setErrorCarrega] = useState(null);
  const [cerca, setCerca] = useState('');
  const accions = useAccionsUsuari({
    onCanviat: (uid, canvis) => setUsuaris((llista) => llista.map((u) => (u.uid === uid ? { ...u, ...canvis } : u))),
    onEliminat: (uid) => setUsuaris((llista) => llista.filter((u) => u.uid !== uid)),
  });

  useEffect(() => {
    let actiu = true;
    llistarUsuaris()
      .then((llista) => { if (actiu) setUsuaris(llista); })
      .catch((e) => { if (actiu) setErrorCarrega(missatgeError(e, ERROR_CARREGA)); });
    return () => { actiu = false; };
  }, []);

  if (errorCarrega) {
    return (
      <PaginaAdmin amplada="llista" titol={TITOL}>
        <p className="form__error" role="alert">{errorCarrega}</p>
      </PaginaAdmin>
    );
  }
  if (usuaris === null) return <Carregant />;

  const visibles = filtrarUsuaris(usuaris, cerca);

  return (
    <PaginaAdmin
      amplada="llista"
      titol={TITOL}
      accions={<BotoAfegir to={ROUTES.USUARIS_TAQUILLA_NOU} etiqueta="Nou usuari" />}
    >
      <p className="usuaris-taquilla__ajuda">
        Comptes que només poden fer servir l&apos;escaneig de carnets a l&apos;entrada de les sessions. Cada persona tria la seva contrasenya amb l&apos;enllaç que rep per correu.
      </p>
      {usuaris.length === 0 && <p>Encara no hi ha cap usuari de taquilla.</p>}
      {usuaris.length > 0 && (
        <input
          className="form__input usuaris-taquilla__cerca"
          type="search"
          aria-label="Cerca un usuari"
          placeholder="Cerca per nom o correu"
          value={cerca}
          onChange={(e) => setCerca(e.target.value)}
        />
      )}
      {usuaris.length > 0 && visibles.length === 0 && <p>Cap usuari coincideix amb la cerca.</p>}
      <ul className="usuaris-taquilla__llista">
        {visibles.map((u) => (
          <li key={u.uid} className="usuaris-taquilla__item">
            <div className="usuaris-taquilla__dades">
              <Link className="enllac usuaris-taquilla__nom" to={ROUTES.USUARIS_TAQUILLA_EDITAR.replace(':uid', u.uid)}>
                {u.nom || 'Sense nom'}
              </Link>
              <span className="usuaris-taquilla__correu">{u.correu}</span>
              <span className={`badge ${u.desactivat ? 'badge--desactivat' : 'badge--al-dia'} usuaris-taquilla__estat`}>
                {u.desactivat ? 'Desactivat' : 'Actiu'}
              </span>
              <span className="usuaris-taquilla__data">Creat: {formatData(u.creat)}</span>
              <span className="usuaris-taquilla__data">Últim accés: {formatData(u.ultimAcces)}</span>
            </div>
            <AccionsUsuari usuari={u} accions={accions} ambEliminar />
            {accions.error?.uid === u.uid && <p className="form__error usuaris-taquilla__error" role="alert">{accions.error.missatge}</p>}
            {accions.enllac?.uid === u.uid && (
              <div className="usuaris-taquilla__enllac">
                <EnllacContrasenya {...accions.enllac} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </PaginaAdmin>
  );
}
