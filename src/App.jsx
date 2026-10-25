import { lazy, Suspense } from 'react';
import {
  BrowserRouter, Routes, Route, Navigate, useLocation,
} from 'react-router-dom';
import * as ROUTES from './constants/routes';
import { ROLE_ADMIN, ROLE_TAQUILLA } from './constants/roles';
import { RequireAuth } from './auth/RequireAuth';
import { RequireRole } from './auth/RequireRole';
import Header from './components/Header';
import { ConfirmacioProvider } from './components/ConfirmacioProvider';
import ErrorBoundary from './components/ErrorBoundary';
import Carregant from './components/Carregant';
import Accedir from './pages/Accedir';
import RedireccioPropostes from './pages/Propostes/RedireccioPropostes';

// Cada pantalla és un fragment propi: recharts, dnd-kit, qrcode i el lector de codis no entren al principal.
const SocisList = lazy(() => import('./pages/Socis/SocisList'));
const SociForm = lazy(() => import('./pages/Socis/SociForm'));
const RegistrarPagamentPage = lazy(() => import('./pages/Socis/RegistrarPagamentPage'));
const CarnetSoci = lazy(() => import('./pages/Socis/CarnetSoci'));
const CarnetsLot = lazy(() => import('./pages/Socis/CarnetsLot'));
const SessionsList = lazy(() => import('./pages/Sessions/SessionsList'));
const SessionForm = lazy(() => import('./pages/Sessions/SessionForm'));
const TicketsPage = lazy(() => import('./pages/Tickets/TicketsPage'));
const TicketsLotPage = lazy(() => import('./pages/Tickets/TicketsLotPage'));
const SolicitudsPendents = lazy(() => import('./pages/Solicituds/SolicitudsPendents'));
const EscaneigPage = lazy(() => import('./pages/Escaneig/EscaneigPage'));
const EscaneigLogPage = lazy(() => import('./pages/Escaneig/EscaneigLogPage'));
const ComptabilitatPage = lazy(() => import('./pages/Comptabilitat/ComptabilitatPage'));
const MovimentForm = lazy(() => import('./pages/Comptabilitat/MovimentForm'));
const DashboardPage = lazy(() => import('./pages/Dashboard/DashboardPage'));
const ConfiguracioPage = lazy(() => import('./pages/Configuracio/ConfiguracioPage'));
const UsuarisTaquillaList = lazy(() => import('./pages/UsuarisTaquilla/UsuarisTaquillaList'));
const UsuariTaquillaNou = lazy(() => import('./pages/UsuarisTaquilla/UsuariTaquillaNou'));
const UsuariTaquillaFitxa = lazy(() => import('./pages/UsuarisTaquilla/UsuariTaquillaFitxa'));
const PropostesPendents = lazy(() => import('./pages/Propostes/PropostesPendents'));
const PropostaForm = lazy(() => import('./pages/Propostes/PropostaForm'));
const PropostesNova = lazy(() => import('./pages/Propostes/PropostesNova'));
const DistribuidoresList = lazy(() => import('./pages/Distribuidores/DistribuidoresList'));
const DistribuidoraForm = lazy(() => import('./pages/Distribuidores/DistribuidoraForm'));
const EntitatsList = lazy(() => import('./pages/Entitats/EntitatsList'));
const EntitatForm = lazy(() => import('./pages/Entitats/EntitatForm'));
const TandesList = lazy(() => import('./pages/Tandes/TandesList'));
const TandaForm = lazy(() => import('./pages/Tandes/TandaForm'));
const TandaResultats = lazy(() => import('./pages/Tandes/TandaResultats'));
const AjudaPage = lazy(() => import('./pages/Ajuda/AjudaPage'));

// Els enllaços antics de la votació eren /#<id>: amb hash van a la web pública;
// sense hash, / porta al login (que ja envia l'admin al dashboard).
function Inici() {
  const hash = window.location.hash;
  return hash.length > 1 ? <RedireccioPropostes /> : <Navigate to={ROUTES.ACCEDIR} replace />;
}

// Un error de render d'una pantalla no s'emporta la capçalera; en canviar de ruta es torna a provar.
function ErrorBoundaryDeRuta({ children }) {
  const { pathname } = useLocation();
  return <ErrorBoundary clauReinici={pathname}>{children}</ErrorBoundary>;
}

export default function App() {
  return (
    <BrowserRouter>
      <ConfirmacioProvider>
        <Header />
        <ErrorBoundaryDeRuta>
          <Suspense fallback={<Carregant />}>
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
              <Route
                path={ROUTES.AJUDA}
                element={
                  <RequireAuth>
                    <RequireRole roles={[ROLE_ADMIN, ROLE_TAQUILLA]}>
                      <AjudaPage />
                    </RequireRole>
                  </RequireAuth>
                }
              />
              <Route path="*" element={<Navigate to={ROUTES.ACCEDIR} replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundaryDeRuta>
      </ConfirmacioProvider>
    </BrowserRouter>
  );
}
