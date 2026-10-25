import { useState } from 'react';
import { useConfirmacio } from '../../components/ConfirmacioProvider';
import {
  canviarEstatUsuari, eliminarUsuari, missatgeError, restablirContrasenya,
} from '../../lib/usuarisTaquilla';

// Accions sobre un usuari de taquilla compartides pel llistat i la fitxa. Només una acció alhora.
// `enllac`: resultat de l'últim «Restableix la contrasenya» ({ uid, correu, enllac, correuEnviat }).
export default function useAccionsUsuari({ onCanviat, onEliminat }) {
  const { confirma } = useConfirmacio();
  const [ocupat, setOcupat] = useState(null);
  const [error, setError] = useState(null);
  const [enllac, setEnllac] = useState(null);

  const executa = async (usuari, accio) => {
    if (ocupat) return;
    setOcupat(usuari.uid);
    setError(null);
    try {
      await accio();
    } catch (e) {
      setError({ uid: usuari.uid, missatge: missatgeError(e) });
    } finally {
      setOcupat(null);
    }
  };

  const alternaEstat = (usuari) => executa(usuari, async () => {
    const desactivat = !usuari.desactivat;
    await canviarEstatUsuari(usuari.uid, desactivat);
    if (desactivat && enllac?.uid === usuari.uid) setEnllac(null);
    onCanviat(usuari.uid, { desactivat });
  });

  // Talla l'accés al moment (contrasenya anul·lada i sessions tancades): es demana confirmació.
  const restableix = (usuari) => executa(usuari, async () => {
    const ok = await confirma({
      titol: 'Restablir la contrasenya',
      missatge: `La contrasenya actual de ${usuari.nom || usuari.correu} deixarà de funcionar ara mateix i se li tancaran les sessions obertes. Rebrà un correu amb un enllaç per triar-ne una de nova.`,
      perill: true,
      etiquetaAcceptar: 'Restableix',
    });
    if (!ok) return;
    setEnllac(null);
    const resultat = await restablirContrasenya(usuari.uid);
    setEnllac({ uid: usuari.uid, correu: usuari.correu, contrasenyaAnullada: true, ...resultat });
  });

  const elimina = (usuari) => executa(usuari, async () => {
    const ok = await confirma({
      titol: 'Eliminar l\'usuari',
      missatge: `Segur que vols eliminar l'usuari ${usuari.nom || usuari.correu} (${usuari.correu})? Perdrà l'accés a la taquilla. Aquesta acció no es pot desfer.`,
      perill: true,
      etiquetaAcceptar: 'Elimina',
    });
    if (!ok) return;
    await eliminarUsuari(usuari.uid);
    if (enllac?.uid === usuari.uid) setEnllac(null);
    onEliminat(usuari.uid);
  });

  return {
    ocupat, error, enllac, setEnllac, alternaEstat, restableix, elimina,
  };
}
