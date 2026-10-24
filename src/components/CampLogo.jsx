import { useRef, useState } from 'react';
import { ref, uploadBytes } from 'firebase/storage';
import { storage } from '../firebase/firebase';
import SelectorFitxer from './SelectorFitxer';
import { ACCEPT_IMATGE, urlStorage, validarImatge } from '../lib/sessioPublica';

const ERROR_PUJADA = "No s'ha pogut pujar la imatge. Torna-ho a provar.";
const ERROR_SENSE_NOM = 'Escriu primer el nom per poder pujar el logo.';

// Bloc «Logo» de les fitxes de catàleg (entitats i distribuïdores). La pujada és immediata a Storage
// (`cami(nom, fitxer, instant)` és el de cada fitxa) i la URL arriba a `onCanvia` com a canvi pendent fins a «Desar».
// `onPujant` avisa la fitxa perquè bloquegi «Desar» i «Descartar canvis» mentre puja.
export default function CampLogo({ logo, nom, cami, pujant, onPujant, onCanvia }) {
  // L'error es recorda amb el nom i el logo del moment: si l'usuari escriu el nom, treu el logo o descarta, ja no val.
  const [avis, setAvis] = useState(null);
  const error = avis && avis.nom === nom && avis.logo === logo ? avis.missatge : null;
  const setError = (missatge) => setAvis(missatge && { missatge, nom, logo });
  const pujantRef = useRef(false);

  const pujar = async (e) => {
    const fitxer = e.target.files?.[0];
    if (!fitxer || pujantRef.current) return;
    setError(null);
    const motiu = nom.trim() ? validarImatge(fitxer) : ERROR_SENSE_NOM;
    if (motiu) {
      setError(motiu);
      return;
    }
    pujantRef.current = true;
    onPujant(true);
    try {
      const camiFitxer = cami(nom, fitxer, Date.now());
      await uploadBytes(ref(storage, camiFitxer), fitxer, { contentType: fitxer.type });
      onCanvia(urlStorage(storage.app.options.storageBucket, camiFitxer));
    } catch {
      setError(ERROR_PUJADA);
    } finally {
      pujantRef.current = false;
      onPujant(false);
    }
  };

  return (
    <div className="form__field camp-logo" role="group" aria-labelledby="logo-titol" aria-describedby={error ? 'logo-ajuda logo-error' : 'logo-ajuda'}>
      <span className="form__label" id="logo-titol">Logo</span>
      <div className="camp-logo__fila">
        {logo && <img className="camp-logo__previsualitzacio" src={logo} alt="" />}
        <SelectorFitxer
          id="logo"
          etiqueta={logo ? 'Canviar el logo' : 'Pujar el logo'}
          accept={ACCEPT_IMATGE}
          onChange={pujar}
          disabled={pujant}
        />
      </div>
      {logo && (
        <button className="btn btn--outline camp-logo__treure" type="button" disabled={pujant} onClick={() => onCanvia('')}>
          Treure el logo
        </button>
      )}
      <p id="logo-ajuda" className="form__ajuda">JPG, PNG o WebP, fins a 10 MB.</p>
      {error && <p id="logo-error" className="form__error" role="alert">{error}</p>}
    </div>
  );
}
