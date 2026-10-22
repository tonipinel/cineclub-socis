import { IdentitatPublicaProvider } from '../../auth/IdentitatPublica.jsx';
import VotarPublic from './VotarPublic.jsx';

// Illa de /propostes/votar/: Astro no pot passar el proveïdor com a fill d'una illa `client:only`.
export default function IllaVotar() {
  return (
    <IdentitatPublicaProvider>
      <VotarPublic />
    </IdentitatPublicaProvider>
  );
}
