import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import * as ROUTES from './constants/routes';
import { ROLE_ADMIN } from './constants/roles';
import { RequireAuth } from './auth/RequireAuth';
import { RequireRole } from './auth/RequireRole';
import Header from './components/Header';
import AltaPublica from './pages/AltaPublica';
import Accedir from './pages/Accedir';

export default function App() {
  return (
    <BrowserRouter>
      <Header />
      <Routes>
        <Route path={ROUTES.ALTA_PUBLICA} element={<AltaPublica />} />
        <Route path={ROUTES.ACCEDIR} element={<Accedir />} />
        <Route
          path={ROUTES.SOCIS}
          element={
            <RequireAuth>
              <RequireRole roles={[ROLE_ADMIN]}>
                <p>Socis (properament)</p>
              </RequireRole>
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to={ROUTES.ALTA_PUBLICA} replace />} />
      </Routes>
    </BrowserRouter>
  );
}
