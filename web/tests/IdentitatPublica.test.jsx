// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { IdentitatPublicaProvider } from '../src/auth/IdentitatPublica.jsx';
import { useIdentitatPublica } from '../src/auth/useIdentitatPublica.js';
import { CLAU_IDENTITAT, llegirIdentitat } from '../src/lib/identitat.js';

const identitat = { numeroSoci: 42, nomPublic: 'Anna', token: 'abc123' };

let ctx;
function Sonda() {
  ctx = useIdentitatPublica();
  return <p data-testid="nom">{ctx.identitat ? ctx.identitat.nomPublic : 'anònim'}</p>;
}

function renderitzar() {
  return render(
    <IdentitatPublicaProvider>
      <Sonda />
    </IdentitatPublicaProvider>,
  );
}

describe('IdentitatPublicaProvider', () => {
  beforeEach(() => {
    sessionStorage.clear();
    ctx = undefined;
  });

  it('arrenca anònim si no hi ha res guardat', () => {
    renderitzar();
    expect(screen.getByTestId('nom')).toHaveTextContent('anònim');
  });

  it('arrenca amb la identitat guardada', () => {
    sessionStorage.setItem(CLAU_IDENTITAT, JSON.stringify(identitat));
    renderitzar();
    expect(screen.getByTestId('nom')).toHaveTextContent('Anna');
  });

  it('setIdentitat(x) la persisteix i dispara identitat-canviada', () => {
    renderitzar();
    const oient = vi.fn();
    window.addEventListener('identitat-canviada', oient);
    act(() => ctx.setIdentitat(identitat));
    window.removeEventListener('identitat-canviada', oient);

    expect(screen.getByTestId('nom')).toHaveTextContent('Anna');
    expect(llegirIdentitat()).toEqual(identitat);
    expect(oient).toHaveBeenCalledTimes(1);
  });

  it('setIdentitat(null) l\'esborra i dispara identitat-canviada', () => {
    sessionStorage.setItem(CLAU_IDENTITAT, JSON.stringify(identitat));
    renderitzar();
    const oient = vi.fn();
    window.addEventListener('identitat-canviada', oient);
    act(() => ctx.setIdentitat(null));
    window.removeEventListener('identitat-canviada', oient);

    expect(screen.getByTestId('nom')).toHaveTextContent('anònim');
    expect(sessionStorage.getItem(CLAU_IDENTITAT)).toBeNull();
    expect(oient).toHaveBeenCalledTimes(1);
  });

  it('setIdentitat accepta un actualitzador funcional resolt contra el valor actual', () => {
    sessionStorage.setItem(CLAU_IDENTITAT, JSON.stringify(identitat));
    renderitzar();
    act(() => ctx.setIdentitat((anterior) => ({ ...anterior, nomPublic: 'Berta' })));
    expect(screen.getByTestId('nom')).toHaveTextContent('Berta');
    expect(llegirIdentitat()).toEqual({ ...identitat, nomPublic: 'Berta' });
  });

  it('dos actualitzadors seguits dins del mateix lot s\'encadenen', () => {
    sessionStorage.setItem(CLAU_IDENTITAT, JSON.stringify(identitat));
    renderitzar();
    act(() => {
      ctx.setIdentitat((a) => ({ ...a, nomPublic: `${a.nomPublic}1` }));
      ctx.setIdentitat((a) => ({ ...a, nomPublic: `${a.nomPublic}2` }));
    });
    expect(llegirIdentitat().nomPublic).toBe('Anna12');
    expect(screen.getByTestId('nom')).toHaveTextContent('Anna12');
  });

  it('un actualitzador que torna null esborra la identitat; sense identitat rep null', () => {
    renderitzar();
    let rebut;
    act(() => ctx.setIdentitat((a) => { rebut = a; return null; }));
    expect(rebut).toBeNull();
    sessionStorage.setItem(CLAU_IDENTITAT, JSON.stringify(identitat));
    act(() => ctx.setIdentitat(identitat));
    act(() => ctx.setIdentitat(() => null));
    expect(sessionStorage.getItem(CLAU_IDENTITAT)).toBeNull();
  });

  it('useIdentitatPublica fora del provider llança error', () => {
    const espia = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Sonda />)).toThrow(/IdentitatPublicaProvider/);
    espia.mockRestore();
  });
});
