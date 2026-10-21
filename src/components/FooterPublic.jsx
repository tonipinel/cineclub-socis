import * as ROUTES from '../constants/routes';

const INSTAGRAM_URL = 'https://www.instagram.com/cineclub.rodadebera';
const FACEBOOK_URL = 'https://www.facebook.com/cineclub.rodadebera';
const CORREU_CONTACTE = 'cineclub.rodadebera@gmail.com';

// Mateix peu que el del lloc principal (cineclubrodadebera.cat), que és on
// aquesta pàgina es presenta com una secció més. Hi afegim l'atribució que
// exigeix TMDB per fer servir la seva API.
export default function FooterPublic() {
  return (
    <footer className="footer-public">
      <div className="footer-public__inner">
        <div className="footer-public__brand">
          <img className="footer-public__logo" src="/logo-footer.png" alt="Cineclub Roda de Berà" />
        </div>
        <nav className="footer-public__nav">
          <a className="footer-public__link" href={`${ROUTES.MARCA_URL}/preguntes-frequents/`}>Preguntes freqüents</a>
          <a className="footer-public__link" href={`${ROUTES.MARCA_URL}/privacitat/`}>Privacitat</a>
        </nav>
        <div className="footer-public__social">
          <a className="footer-public__icona" href={INSTAGRAM_URL} aria-label="Instagram" target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.2c3.2 0 3.6 0 4.9.07 3.3.15 4.8 1.7 4.95 4.95.06 1.3.07 1.6.07 4.8s0 3.5-.07 4.8c-.15 3.25-1.65 4.8-4.95 4.95-1.3.06-1.6.07-4.9.07s-3.6 0-4.9-.07c-3.3-.15-4.8-1.7-4.95-4.95C2.08 15.5 2.07 15.2 2.07 12s0-3.5.07-4.8c.15-3.25 1.65-4.8 4.95-4.95C8.4 2.2 8.7 2.2 12 2.2zm0 1.8c-3.14 0-3.5 0-4.74.07-2.32.1-3.4 1.2-3.5 3.5C3.7 8.5 3.7 8.86 3.7 12s0 3.5.06 4.43c.1 2.3 1.18 3.4 3.5 3.5.94.05 1.3.06 4.44.06s3.5 0 4.44-.06c2.32-.1 3.4-1.2 3.5-3.5.05-.93.06-1.3.06-4.43s0-3.5-.06-4.43c-.1-2.3-1.18-3.4-3.5-3.5A67 67 0 0 0 12 4zm0 3.4a4.6 4.6 0 1 1 0 9.2 4.6 4.6 0 0 1 0-9.2zm0 1.8a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6zm5.9-2a1.08 1.08 0 1 1-2.15 0 1.08 1.08 0 0 1 2.15 0z" /></svg>
          </a>
          <a className="footer-public__icona" href={FACEBOOK_URL} aria-label="Facebook" target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13.5 21v-8h2.7l.4-3.1h-3.1V8c0-.9.25-1.5 1.55-1.5H16.7V3.7C16.4 3.66 15.4 3.6 14.3 3.6c-2.3 0-3.9 1.4-3.9 4v2.3H7.7v3.1h2.7v8h3.1z" /></svg>
          </a>
          <a className="footer-public__icona" href={`mailto:${CORREU_CONTACTE}`} aria-label="Correu electrònic">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></svg>
          </a>
        </div>
      </div>
      <p className="footer-public__atribucio">
        Dades i cartells de pel·lícules de{' '}
        <a className="footer-public__link" href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer">TMDB</a>.
        {' '}Aquest producte utilitza l'API de TMDB però no està avalat ni certificat per TMDB.
      </p>
      <p className="footer-public__copyright">&copy; {new Date().getFullYear()} Cineclub Roda de Berà</p>
    </footer>
  );
}
