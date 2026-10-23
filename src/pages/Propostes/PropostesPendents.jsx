import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import * as ROUTES from '../../constants/routes';
import { formatEuros } from '../../lib/moviments';
import Carregant from '../../components/Carregant';
import { dadesEfectives, INTERNA_BUIDA } from '../../components/GestioInternaProposta';
import BotoAfegir from '../../components/BotoAfegir';
import PaginaAdmin from '../../components/PaginaAdmin';

const CLASSE_ESTAT = {
  pendent: 'badge--pendent', aprovada: 'badge--al-dia', rebutjada: 'badge--vencut', programada: 'badge--nou-registre',
};

const ETIQUETES_ESTAT = {
  pendent: 'Pendent', aprovada: 'Aprovada', rebutjada: 'Rebutjada', programada: 'Programada',
};

// Les dades internes i les distribuïdores són informatives: si no es poden
// llegir, el llistat es mostra igualment, només amb el títol i l'estat.
const llegirOBuit = (nom) => getDocs(collection(db, nom)).catch(() => ({ docs: [] }));

function GestioPropostes() {
  const [dades, setDades] = useState(null);

  useEffect(() => {
    Promise.all([
      getDocs(collection(db, 'propostes')),
      llegirOBuit('propostesInternes'),
      llegirOBuit('distribuidores'),
    ]).then(([propostesSnap, internesSnap, distribuidoresSnap]) => {
      setDades({
        propostes: propostesSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        internes: new Map(internesSnap.docs.map((d) => [d.id, d.data()])),
        distribuidores: new Map(distribuidoresSnap.docs.map((d) => [d.id, { id: d.id, ...d.data() }])),
      });
    });
  }, []);

  if (dades === null) return <Carregant />;
  const { propostes, internes, distribuidores } = dades;
  const files = propostes.map((p) => {
    const dadesInternes = internes.get(p.id);
    const interna = { ...INTERNA_BUIDA, ...dadesInternes, preu: String(dadesInternes?.preu ?? '') };
    const distribuidora = distribuidores.get(interna.distribuidoraId);
    return { proposta: p, distribuidora, efectives: dadesEfectives(interna, distribuidora) };
  });

  return (
    <>
      {propostes.length === 0 && <p>Encara no hi ha cap proposta.</p>}
      {propostes.length > 0 && (
        <div className="scroll-horitzontal propostes-pendents__taula-wrap" role="region" tabIndex={0} aria-label="Taula de propostes">
          <table className="propostes-pendents__taula">
            <thead>
              <tr>
                <th>Proposta</th>
                <th>Distribuïdora</th>
                <th>Preu</th>
                <th>Estat</th>
              </tr>
            </thead>
            <tbody>
              {files.map(({ proposta: p, distribuidora, efectives }) => (
                <tr key={p.id}>
                  <td>
                    <Link className="enllac" to={ROUTES.PROPOSTES_EDITAR.replace(':id', p.id)}>{p.titol}</Link>
                  </td>
                  <td>{distribuidora?.nom ?? '—'}</td>
                  <td className="propostes-pendents__preu">
                    {efectives.preu === null ? '—' : formatEuros(efectives.preu)}
                    {efectives.preuPerDefecte && (
                      <span className="propostes-pendents__per-defecte" title="Preu per defecte de la distribuïdora"> *</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${CLASSE_ESTAT[p.estat] ?? ''}`}>{ETIQUETES_ESTAT[p.estat] ?? p.estat}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {files.some((fila) => fila.efectives.preuPerDefecte) && (
        <p className="propostes-pendents__nota">* Preu per defecte de la distribuïdora.</p>
      )}
    </>
  );
}

export default function PropostesPendents() {
  return (
    <PaginaAdmin
      amplada="llista"
      titol="Propostes de programació"
      accions={<BotoAfegir to={ROUTES.PROPOSTES_NOVA} etiqueta="Nova proposta" />}
    >
      <GestioPropostes />
    </PaginaAdmin>
  );
}
