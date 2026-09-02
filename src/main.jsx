import { createRoot } from 'react-dom/client';
import App from './App';
import { AuthProvider } from './auth/AuthProvider';
import { IdentitatPublicaProvider } from './auth/IdentitatPublicaProvider';
import './styles/main.css';

createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <IdentitatPublicaProvider>
      <App />
    </IdentitatPublicaProvider>
  </AuthProvider>
);
