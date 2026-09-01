import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import * as ROUTES from './constants/routes';
import { ROLE_ADMIN, ROLE_TAQUILLA } from './constants/roles';
import { RequireAuth } from './auth/RequireAuth';
import { RequireRole } from './auth/RequireRole';
import Header from './components/Header';
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
import ComptabilitatPage from './pages/Comptabilitat/ComptabilitatPage';
import MovimentForm from './pages/Comptabilitat/MovimentForm';
import DashboardPage from './pages/Dashboard/DashboardPage';
import ConfiguracioPage from './pages/Configuracio/ConfiguracioPage';

export default function App() {
  return (
    <BrowserRouter>
      <Header />
      <Routes>
        <Route path="/" element={<Navigate to={ROUTES.ACCEDIR} replace />} />
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
        <Route path="*" element={<Navigate to={ROUTES.ACCEDIR} replace />} />
      </Routes>
    </BrowserRouter>
  );
}
