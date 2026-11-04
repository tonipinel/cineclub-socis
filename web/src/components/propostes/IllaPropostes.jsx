import { IdentitatPublicaProvider } from '../../auth/IdentitatPublica.jsx';
import PropostesPublic from './PropostesPublic.jsx';

// Illa de /propostes/: Astro no pot passar el proveïdor com a fill d'una illa `client:only`.
export default function IllaPropostes({ beneficis, iconaSocia }) {
  return (
    <IdentitatPublicaProvider>
      <PropostesPublic beneficis={beneficis} iconaSocia={iconaSocia} />
    </IdentitatPublicaProvider>
  );
}
