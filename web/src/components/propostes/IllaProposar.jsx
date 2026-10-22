import { IdentitatPublicaProvider } from '../../auth/IdentitatPublica.jsx';
import ProposarPellicula from './ProposarPellicula.jsx';

// Illa de /propostes/proposar/ (vegeu IllaPropostes).
export default function IllaProposar() {
  return (
    <IdentitatPublicaProvider>
      <ProposarPellicula />
    </IdentitatPublicaProvider>
  );
}
