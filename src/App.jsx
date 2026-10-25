import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import * as ROUTES from './constants/routes';
import { ROLE_ADMIN, ROLE_TAQUILLA } from './constants/roles';
import { RequireAuth } from './auth/RequireAuth';
import { RequireRole } from './auth/RequireRole';
import Header from './components/Header';
import { ConfirmacioProvider } from './components/ConfirmacioProvider';
import Accedir from './pages/Accedir';
import SocisList from './pages/Socis/SocisList';
import SociForm from './pages/Socis/SociForm';
import RegistrarPagamentPage from './pages/Socis/RegistrarPagamentPage';
import CarnetSoci from './pages/Socis/CarnetSoci';
import CarnetsLot from './pages/Socis/CarnetsLot';
import SessionsList from './pages/Sessions/SessionsList';
import SessionForm from './pages/Sessions/SessionForm';
import TicketsPage from './pages/Tickets/TicketsPage';
import TicketsLotPage from './pages/Tickets/TicketsLotPage';
import SolicitudsPendents from './pages/Solicituds/SolicitudsPendents';
import EscaneigPage from './pages/Escaneig/EscaneigPage';
import EscaneigLogPage from './pages/Escaneig/EscaneigLogPage';
import ComptabilitatPage from './pages/Comptabilitat/ComptabilitatPage';
import MovimentForm from './pages/Comptabilitat/MovimentForm';
import DashboardPage from './pages/Dashboard/DashboardPage';
import ConfiguracioPage from './pages/Configuracio/ConfiguracioPage';
import UsuarisTaquillaList from './pages/UsuarisTaquilla/UsuarisTaquillaList';
import UsuariTaquillaNou from './pages/UsuarisTaquilla/UsuariTaquillaNou';
import UsuariTaquillaFitxa from './pages/UsuarisTaquilla/UsuariTaquillaFitxa';
import RedireccioPropostes from './pages/Propostes/RedireccioPropostes';
import PropostesPendents from './pages/Propostes/PropostesPendents';
import PropostaForm from './pages/Propostes/PropostaForm';
import PropostesNova from './pages/Propostes/PropostesNova';
import DistribuidoresList from './pages/Distribuidores/DistribuidoresList';
import DistribuidoraForm from './pages/Distribuidores/DistribuidoraForm';
import EntitatsList from './pages/Entitats/EntitatsList';
import EntitatForm from './pages/Entitats/EntitatForm';
import TandesList from './pages/Tandes/TandesList';
import TandaForm from './pages/Tandes/TandaForm';
import TandaResultats from './pages/Tandes/TandaResultats';

// Els enllaços antics de la votació eren /#<id>: amb hash van a la web pública;
// sense hash, / porta al login (que ja envia l'admin al dashboard).
function Inici() {
  const hash = window.location.hash;
  return hash.length > 1 ? <RedireccioPropostes /> : <Navigate to={ROUTES.ACCEDIR} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <ConfirmacioProvider>
        <Header />
        <Routes>
          <Route path={ROUTES.INICI} element={<Inici />} />
          <Route path={ROUTES.PROPOSTES} element={<RedireccioPropostes />} />
          <Route path={ROUTES.PROPOSTES_PROPOSAR} element={<RedireccioPropostes />} />
          <Route path={ROUTES.ACCEDIR} element={<Accedir />} />
          <Route
            path={ROUTES.SOCIS}
            element={
              <RequireAuth>
                <RequireRole roles={[ROLE_ADMIN]}>
                  <SocisList />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.SOCIS_NOU}
            element={
              <RequireAuth>
                <RequireRole roles={[ROLE_ADMIN]}>
                  <SociForm />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.SOCIS_EDITAR}
            element={
              <RequireAuth>
                <RequireRole roles={[ROLE_ADMIN]}>
                  <SociForm />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.SOCIS_PAGAMENT}
            element={
              <RequireAuth>
                <RequireRole roles={[ROLE_ADMIN]}>
                  <RegistrarPagamentPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.SOCIS_CARNET}
            element={
              <RequireAuth>
                <RequireRole roles={[ROLE_ADMIN]}>
                  <CarnetSoci />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.SOCIS_CARNETS}
            element={
              <RequireAuth>
                <RequireRole roles={[ROLE_ADMIN]}>
                  <CarnetsLot />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.SESSIONS}
            element={
              <RequireAuth>
                <RequireRole roles={[ROLE_ADMIN]}>
                  <SessionsList />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.SESSIONS_NOVA}
            element={
              <RequireAuth>
                <RequireRole roles={[ROLE_ADMIN]}>
                  <SessionForm />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.SESSIONS_EDITAR}
            element={
              <RequireAuth>
                <RequireRole roles={[ROLE_ADMIN]}>
                  <SessionForm />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.TICKETS}
            element={
              <RequireAuth>
                <RequireRole roles={[ROLE_ADMIN]}>
                  <TicketsPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.TICKETS_LOT}
            element={
              <RequireAuth>
                <RequireRole roles={[ROLE_ADMIN]}>
                  <TicketsLotPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.ESCANEIG}
            element={
              <RequireAuth>
                <RequireRole roles={[ROLE_ADMIN, ROLE_TAQUILLA]}>
                  <EscaneigPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.ESCANEIG_LOG}
            element={
              <RequireAuth>
                <RequireRole roles={[ROLE_ADMIN, ROLE_TAQUILLA]}>
                  <EscaneigLogPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.SOLICITUDS}
            element={
              <RequireAuth>
                <RequireRole roles={[ROLE_ADMIN]}>
                  <SolicitudsPendents />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.COMPTABILITAT}
            element={
              <RequireAuth>
                <RequireRole roles={[ROLE_ADMIN]}>
                  <ComptabilitatPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.COMPTABILITAT_NOU}
            element={
              <RequireAuth>
                <RequireRole roles={[ROLE_ADMIN]}>
                  <MovimentForm />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.COMPTABILITAT_EDITAR}
            element={
              <RequireAuth>
                <RequireRole roles={[ROLE_ADMIN]}>
                  <MovimentForm />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.DASHBOARD}
            element={
              <RequireAuth>
                <RequireRole roles={[ROLE_ADMIN]}>
                  <DashboardPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.CONFIGURACIO}
            element={
              <RequireAuth>
                <RequireRole roles={[ROLE_ADMIN]}>
                  <ConfiguracioPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.USUARIS_TAQUILLA}
            element={
              <RequireAuth>
                <RequireRole roles={[ROLE_ADMIN]}>
                  <UsuarisTaquillaList />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.USUARIS_TAQUILLA_NOU}
            element={
              <RequireAuth>
                <RequireRole roles={[ROLE_ADMIN]}>
                  <UsuariTaquillaNou />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.USUARIS_TAQUILLA_EDITAR}
            element={
              <RequireAuth>
                <RequireRole roles={[ROLE_ADMIN]}>
                  <UsuariTaquillaFitxa />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.DISTRIBUIDORES}
            element={
              <RequireAuth>
                <RequireRole roles={[ROLE_ADMIN]}>
                  <DistribuidoresList />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.DISTRIBUIDORES_NOVA}
            element={
              <RequireAuth>
                <RequireRole roles={[ROLE_ADMIN]}>
                  <DistribuidoraForm />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.DISTRIBUIDORES_EDITAR}
            element={
              <RequireAuth>
                <RequireRole roles={[ROLE_ADMIN]}>
                  <DistribuidoraForm />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.ENTITATS}
            element={
              <RequireAuth>
                <RequireRole roles={[ROLE_ADMIN]}>
                  <EntitatsList />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.ENTITATS_NOVA}
            element={
              <RequireAuth>
                <RequireRole roles={[ROLE_ADMIN]}>
                  <EntitatForm />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.ENTITATS_EDITAR}
            element={
              <RequireAuth>
                <RequireRole roles={[ROLE_ADMIN]}>
                  <EntitatForm />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.PROPOSTES_PENDENTS}
            element={
              <RequireAuth>
                <RequireRole roles={[ROLE_ADMIN]}>
                  <PropostesPendents />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.PROPOSTES_NOVA}
            element={
              <RequireAuth>
                <RequireRole roles={[ROLE_ADMIN]}>
                  <PropostesNova />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.PROPOSTES_EDITAR}
            element={
              <RequireAuth>
                <RequireRole roles={[ROLE_ADMIN]}>
                  <PropostaForm />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.TANDES}
            element={
              <RequireAuth>
                <RequireRole roles={[ROLE_ADMIN]}>
                  <TandesList />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.TANDES_NOVA}
            element={
              <RequireAuth>
                <RequireRole roles={[ROLE_ADMIN]}>
                  <TandaForm />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.TANDES_EDITAR}
            element={
              <RequireAuth>
                <RequireRole roles={[ROLE_ADMIN]}>
                  <TandaForm />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.TANDES_RESULTATS}
            element={
              <RequireAuth>
                <RequireRole roles={[ROLE_ADMIN]}>
                  <TandaResultats />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to={ROUTES.ACCEDIR} replace />} />
        </Routes>
      </ConfirmacioProvider>
    </BrowserRouter>
  );
}
