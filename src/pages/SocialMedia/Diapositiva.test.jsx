import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Diapositiva from './Diapositiva';

const SESSIO = {
  titol: 'Pig', data: '2026-10-22', hora: '19:00',
  publica: { titol: 'Pig', cartell: 'https://x/cartell.jpg', versioTipus: 'vose' },
};

describe('franges i fons', () => {
  it.each([
    ['tancament', { tipus: 'tancament' }],
    ['tancament de Programació', { tipus: 'tancament-programacio', imatges: [], versio: false }],
  ])('el %s porta el mosaic però cap franja, ni superior ni inferior', (_nom, diapositiva) => {
    const { container } = render(<Diapositiva sessio={SESSIO} diapositiva={diapositiva} />);
    expect(container.querySelector('.social-slide__fons')).not.toBeNull();
    expect(container.querySelector('.social-slide__franja')).toBeNull();
  });

  it('la curiositat no té franges: el text va en una targeta fosca de cantó a cantó', () => {
    const { container } = render(<Diapositiva sessio={SESSIO} diapositiva={{ tipus: 'curiositat', text: 'Text', imatge: null }} />);
    expect(container.querySelector('.social-slide__fons')).not.toBeNull();
    expect(container.querySelector('.social-slide__franja')).toBeNull();
    expect(container.querySelector('.social-slide__targeta .social-slide__text')).not.toBeNull();
  });
});

describe('portada d\'una sessió dins de Programació (amb franges)', () => {
  it('mostra el cartell, el dia i l\'hora, però ni «Propera sessió» ni el lloc', () => {
    render(<Diapositiva sessio={SESSIO} diapositiva={{ tipus: 'portada-programacio' }} />);
    expect(screen.getByAltText('Pig')).toHaveAttribute('src', 'https://x/cartell.jpg');
    expect(screen.getByText("Dijous 22 d'octubre")).toBeInTheDocument();
    expect(screen.getByText('19:00h')).toBeInTheDocument();
    expect(screen.queryByText('Propera sessió')).not.toBeInTheDocument();
    expect(screen.queryByText('Teatre del Casino Municipal de Roda de Berà')).not.toBeInTheDocument();
  });

  it('el dia i l\'hora van en una sola línia, i més petits si la data és llarga', () => {
    const { container, rerender } = render(<Diapositiva sessio={SESSIO} diapositiva={{ tipus: 'portada-programacio' }} />);
    expect(container.querySelector('.social-slide__quan').textContent).toBe("Dijous 22 d'octubre 19:00h");
    expect(container.querySelector('.social-slide__quan--llarga')).toBeNull();
    rerender(<Diapositiva sessio={{ ...SESSIO, data: '2026-12-30' }} diapositiva={{ tipus: 'portada-programacio' }} />);
    expect(container.querySelector('.social-slide__quan').textContent).toBe('Dimecres 30 de desembre 19:00h');
    expect(container.querySelector('.social-slide__quan--llarga')).not.toBeNull();
  });

  it('el logo del Cineclub va a la franja blanca de baix (i no a la negra de dalt), i el peu no diu «Organitza:»', () => {
    const { container } = render(<Diapositiva sessio={SESSIO} diapositiva={{ tipus: 'portada-programacio' }} logos={['https://x/aj.png']} />);
    expect(container.querySelector('.social-slide__franja--baix img.social-slide__logo--peu-programacio[alt="Cineclub Roda de Berà"]')).not.toBeNull();
    expect(container.querySelector('.social-slide__franja--dalt img')).toBeNull();
    expect(screen.queryByText('Organitza:')).not.toBeInTheDocument();
  });

  it('la franja inferior porta el filet daurat com a capa pròpia, per sobre del degradat', () => {
    const { container } = render(<Diapositiva sessio={SESSIO} diapositiva={{ tipus: 'portada-programacio' }} distribuidora="https://x/d.png" />);
    const franja = container.querySelector('.social-slide__franja--baix');
    const filet = franja.querySelector('.social-slide__filet');
    expect(filet).not.toBeNull();
    expect(filet).toHaveAttribute('aria-hidden', 'true');
    // és el primer fill: es pinta damunt del degradat i del bloc blanc, però per sota del logo del Cineclub (que va després i el tapa)
    expect(franja.firstElementChild).toBe(filet);
    const logo = franja.querySelector('.social-slide__logo--peu-programacio');
    expect(filet.compareDocumentPosition(logo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('la franja inferior hi és sempre (porta el logo del Cineclub), també sense col·laboradors ni distribuïdora', () => {
    const { container } = render(<Diapositiva sessio={SESSIO} diapositiva={{ tipus: 'portada-programacio' }} />);
    expect(container.querySelector('.social-slide__franja--baix .social-slide__logo--peu-programacio')).not.toBeNull();
  });

  it('la pastilla del tipus de sessió va a dalt a l\'esquerra, dins de la franja negra, amb el color de la secció', () => {
    const { container, rerender } = render(<Diapositiva sessio={SESSIO} diapositiva={{ tipus: 'portada-programacio' }} />);
    const pastilla = container.querySelector('.social-slide__franja--dalt .social-slide__seccio-programacio');
    expect(pastilla.textContent).toBe('Cartellera');
    expect(pastilla.style.backgroundColor).toBe('rgb(191, 144, 0)');
    rerender(<Diapositiva sessio={{ ...SESSIO, publica: { ...SESSIO.publica, seccio: 'xiquets' } }} diapositiva={{ tipus: 'portada-programacio' }} />);
    const xiquis = container.querySelector('.social-slide__franja--dalt .social-slide__seccio-programacio');
    expect(xiquis.textContent).toBe('Xiquis');
    expect(xiquis.style.backgroundColor).toBe('rgb(167, 139, 212)');
  });

  it('el logo de la distribuïdora va a la dreta, en un bloc blanc després del peu, i els col·laboradors al degradat', () => {
    const { container } = render(<Diapositiva sessio={SESSIO} diapositiva={{ tipus: 'portada-programacio' }} logos={['https://x/aj.png']} distribuidora="https://x/d.png" />);
    const franja = container.querySelector('.social-slide__franja--baix');
    const peu = franja.querySelector('.social-slide__peu');
    expect([...peu.querySelectorAll('img')].map((i) => i.getAttribute('src'))).toEqual(['https://x/aj.png']);
    expect(peu.querySelector('img[src="https://x/aj.png"]')).toHaveClass('social-slide__logo-entitat');
    const bloc = franja.querySelector('.social-slide__peu-distribuidora');
    expect(bloc.previousElementSibling).toBe(peu); // a la dreta del peu
    expect(bloc).toBe(franja.lastElementChild);
    expect(bloc.querySelector('img[src="https://x/d.png"]')).toHaveClass('social-slide__logo-distribuidora');
  });

  it('amb col·laboradors, la franja inferior diu «Amb la col·laboració de:» i en porta els logos', () => {
    const { container } = render(<Diapositiva sessio={SESSIO} diapositiva={{ tipus: 'portada-programacio' }} logos={['https://x/aj.png']} />);
    expect(container.querySelector('.social-slide__franja--baix')).not.toBeNull();
    expect(screen.getByText(/Amb la col·laboració de/)).toBeInTheDocument();
    expect(container.querySelector('img[src="https://x/aj.png"]')).not.toBeNull();
  });

  it('sempre que hi ha distribuïdora, en surt el logo a la franja inferior (sense text de col·laboració)', () => {
    const { container } = render(<Diapositiva sessio={SESSIO} diapositiva={{ tipus: 'portada-programacio' }} distribuidora="https://x/d.png" />);
    expect(container.querySelector('.social-slide__franja--baix img[src="https://x/d.png"]')).not.toBeNull();
    expect(screen.queryByText(/col·laboració/)).not.toBeInTheDocument();
  });

  it('usa la imatge ja convertida a data: si n\'hi ha', () => {
    render(<Diapositiva sessio={SESSIO} diapositiva={{ tipus: 'portada-programacio' }} imatges={{ 'https://x/cartell.jpg': 'data:image/jpeg;base64,AAA' }} />);
    expect(screen.getByAltText('Pig')).toHaveAttribute('src', 'data:image/jpeg;base64,AAA');
  });

  it('sense cartell la portada surt igualment', () => {
    render(<Diapositiva sessio={{ ...SESSIO, publica: { titol: 'Pig' } }} diapositiva={{ tipus: 'portada-programacio' }} />);
    expect(screen.getByText('Pig')).toBeInTheDocument();
  });
});

describe('Diapositiva curiositat amb Filmoxarxa', () => {
  const curiositat = { tipus: 'curiositat', text: 'Text', imatge: null };

  it('si la distribuïdora és Filmoxarxa, el seu logo va al costat del del Cineclub', () => {
    const { container } = render(<Diapositiva sessio={SESSIO} diapositiva={curiositat} filmoxarxa distribuidora="https://x/f.png" />);
    const parella = container.querySelector('.social-slide__logos-parella');
    expect(parella).not.toBeNull();
    expect(parella.querySelector('img[alt="Cineclub Roda de Berà"]')).not.toBeNull();
    expect(parella.querySelector('img[src="https://x/f.png"]')).not.toBeNull();
    expect(parella.querySelector('.social-slide__logo')).not.toBeNull();
  });

  it.each([
    ['curiositat', { tipus: 'curiositat', text: 'Text', imatge: null }],
    ['tancament', { tipus: 'tancament' }],
  ])('a la diapositiva de %s el logo de Filmoxarxa va dins d\'una pastilla blanca (està tallat a sang)', (_nom, diapositiva) => {
    const { container } = render(<Diapositiva sessio={SESSIO} diapositiva={diapositiva} filmoxarxa distribuidora="https://x/f.png" />);
    const pastilla = container.querySelector('.social-slide__logos-parella .social-slide__pastilla img[src="https://x/f.png"]')?.parentElement;
    expect(pastilla).toHaveClass('social-slide__pastilla');
    // el del Cineclub no hi va: ja té el seu propi fons
    expect(pastilla.querySelector('img[alt="Cineclub Roda de Berà"]')).toBeNull();
  });

  it('amb una altra distribuïdora o sense logo, només hi ha el logo del Cineclub', () => {
    const { container, rerender } = render(<Diapositiva sessio={SESSIO} diapositiva={curiositat} distribuidora="https://x/f.png" />);
    expect(container.querySelector('.social-slide__logos-parella')).toBeNull();
    expect(container.querySelector('img[src="https://x/f.png"]')).toBeNull();
    rerender(<Diapositiva sessio={SESSIO} diapositiva={curiositat} filmoxarxa />);
    expect(container.querySelector('.social-slide__logos-parella')).toBeNull();
    expect(screen.getByAltText('Cineclub Roda de Berà')).toBeInTheDocument();
  });

  it('al tancament de la pel·lícula també, però sense Filmoxarxa al tancament de Programació', () => {
    const { container, rerender } = render(<Diapositiva sessio={SESSIO} diapositiva={{ tipus: 'tancament' }} filmoxarxa distribuidora="https://x/f.png" />);
    const parella = container.querySelector('.social-slide__logos-parella');
    expect(parella.querySelector('img[alt="Cineclub Roda de Berà"]')).not.toBeNull();
    expect(parella.querySelector('img[src="https://x/f.png"]')).not.toBeNull();
    rerender(<Diapositiva sessio={SESSIO} diapositiva={{ tipus: 'tancament-programacio', imatges: [], versio: false }} filmoxarxa distribuidora="https://x/f.png" />);
    expect(container.querySelector('.social-slide__logos-parella img[alt="Ajuntament de Roda de Berà"]')).not.toBeNull();
    expect(container.querySelector('img[src="https://x/f.png"]')).toBeNull();
  });

  it.each([
    ['tancament', { tipus: 'tancament' }],
    ['tancament-programacio', { tipus: 'tancament-programacio', imatges: [], versio: false }],
  ])('el %s porta el logo de l\'Ajuntament amb el text «Amb la col·laboració de:» al costat del del Cineclub', (_nom, diapositiva) => {
    const { container } = render(<Diapositiva sessio={SESSIO} diapositiva={diapositiva} />);
    const parella = container.querySelector('.social-slide__logos-parella');
    expect(parella.querySelector('img[alt="Cineclub Roda de Berà"]')).not.toBeNull();
    expect(parella.querySelector('.social-slide__colabora-text')).toHaveTextContent('Amb la col·laboració de:');
    expect(parella.querySelector('.social-slide__pastilla img[alt="Ajuntament de Roda de Berà"]')).not.toBeNull();
  });

  it('les curiositats no porten el logo de l\'Ajuntament', () => {
    const { container } = render(<Diapositiva sessio={SESSIO} diapositiva={curiositat} />);
    expect(container.querySelector('img[alt="Ajuntament de Roda de Berà"]')).toBeNull();
  });

  it('usa el logo ja convertit a data:', () => {
    const { container } = render(<Diapositiva sessio={SESSIO} diapositiva={curiositat} filmoxarxa distribuidora="https://x/f.png" imatges={{ 'https://x/f.png': 'data:image/png;base64,AAA' }} />);
    expect(container.querySelector('.social-slide__logos-parella img[src="data:image/png;base64,AAA"]')).not.toBeNull();
  });
});

describe('Diapositiva curiositat', () => {
  it('mostra el text amb negreta i el fotograma', () => {
    render(<Diapositiva sessio={SESSIO} diapositiva={{ tipus: 'curiositat', text: 'Una **gran** idea', imatge: 'https://x/g1.jpg' }} />);
    expect(screen.getByText('gran').tagName).toBe('STRONG');
    expect(document.querySelector('img[src="https://x/g1.jpg"]')).not.toBeNull();
  });

  it('sense fotograma és només text', () => {
    const { container } = render(<Diapositiva sessio={SESSIO} diapositiva={{ tipus: 'curiositat', text: 'Text', imatge: null }} />);
    expect(container.querySelector('.social-slide__fotograma')).toBeNull();
    expect(screen.getByText('Text')).toBeInTheDocument();
  });

  it('el text s\'encongeix segons la longitud', () => {
    const mida = (text) => {
      const { container, unmount } = render(<Diapositiva sessio={SESSIO} diapositiva={{ tipus: 'curiositat', text, imatge: null }} />);
      const classe = container.querySelector('.social-slide__text').className;
      unmount();
      return classe;
    };
    expect(mida('a'.repeat(50))).toContain('social-slide__text--xl');
    expect(mida('a'.repeat(100))).toContain('social-slide__text--l');
    expect(mida('a'.repeat(150))).toContain('social-slide__text--m');
    expect(mida('a'.repeat(210))).toContain('social-slide__text--s');
    expect(mida('a'.repeat(280))).toContain('social-slide__text--xs');
  });
});

describe('Diapositiva tancament', () => {
  it('fa un collage de fins a 4 fotogrames i no en pinta cap si no n\'hi ha', () => {
    const galeria = ['g1', 'g2', 'g3', 'g4', 'g5'].map((g) => `https://x/${g}.jpg`);
    const { container, rerender } = render(<Diapositiva sessio={{ ...SESSIO, publica: { ...SESSIO.publica, galeria } }} diapositiva={{ tipus: 'tancament' }} />);
    expect(container.querySelectorAll('.social-slide__negatiu img')).toHaveLength(4);
    rerender(<Diapositiva sessio={SESSIO} diapositiva={{ tipus: 'tancament' }} />);
    expect(container.querySelector('.social-slide__collage')).toBeNull();
  });

  it('mostra la frase de versió només per a VOSE/VOSC, el dia, l\'hora, el lloc i el logo', () => {
    const { rerender } = render(<Diapositiva sessio={SESSIO} diapositiva={{ tipus: 'tancament' }} />);
    expect(screen.getByText(/en V\.O\. subtitulada/)).toBeInTheDocument();
    expect(screen.getByText("Dijous 22 d'octubre")).toBeInTheDocument();
    expect(screen.getByText('19:00h')).toBeInTheDocument();
    expect(screen.getByAltText('Cineclub Roda de Berà')).toBeInTheDocument();
    expect(screen.getByText('cineclubrodadebera.cat')).toBeInTheDocument();
    rerender(<Diapositiva sessio={{ ...SESSIO, publica: { ...SESSIO.publica, versioTipus: 'vo' } }} diapositiva={{ tipus: 'tancament' }} />);
    expect(screen.queryByText(/V\.O\. subtitulada/)).not.toBeInTheDocument();
  });
});

describe('collage del tancament', () => {
  const files = (container) => [...container.querySelectorAll('.social-slide__collage-fila')].map((f) => f.querySelectorAll('.social-slide__negatiu').length);
  const galeria = (n) => Array.from({ length: n }, (_, i) => `https://x/g${i}.jpg`);
  const tancament = (n) => <Diapositiva sessio={{ ...SESSIO, publica: { ...SESSIO.publica, galeria: galeria(n) } }} diapositiva={{ tipus: 'tancament' }} />;

  it.each([[1, [1]], [2, [2]], [3, [2, 1]], [4, [2, 2]]])('%i fotogrames van en files %j: l\'imparell queda centrat, sense fer-se més gran', (n, esperat) => {
    const { container } = render(tancament(n));
    expect(files(container)).toEqual(esperat);
  });

  it('el de Programació fa el mateix amb les seves imatges', () => {
    const { container } = render(<Diapositiva sessio={{}} diapositiva={{ tipus: 'tancament-programacio', imatges: galeria(3), versio: false }} />);
    expect(files(container)).toEqual([2, 1]);
  });
});

describe('collage amb imatges repetides', () => {
  it('no genera claus de React duplicades quan dues sessions comparteixen imatge', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const iguals = ['https://x/a.jpg', 'https://x/a.jpg', 'https://x/a.jpg', 'https://x/a.jpg'];
    const { container } = render(<Diapositiva sessio={{}} diapositiva={{ tipus: 'tancament-programacio', imatges: iguals, versio: false }} />);
    expect(container.querySelectorAll('.social-slide__negatiu')).toHaveLength(4);
    const avisos = error.mock.calls.filter(([m]) => String(m).includes('same key') || String(m).includes('unique "key"'));
    expect(avisos).toHaveLength(0);
    error.mockRestore();
  });
});

describe('invitació del tancament', () => {
  it.each([
    ['tancament', { tipus: 'tancament' }, 'i gaudeix de la pel·lícula'],
    ['tancament de Programació', { tipus: 'tancament-programacio', imatges: [], versio: true }, 'i gaudeix del cinema'],
  ])('el %s posa «Cineclub Roda de Berà» sencer en una sola línia', (_nom, diapositiva, segona) => {
    const { container } = render(<Diapositiva sessio={SESSIO} diapositiva={diapositiva} />);
    const linies = [...container.querySelectorAll('.social-slide__invitacio-linia')];
    expect(linies[0].textContent).toBe('Vine al Cineclub Roda de Berà');
    expect(linies[0].querySelector('strong').textContent).toBe('Cineclub Roda de Berà');
    expect(linies[1].textContent).toBe(segona);
    expect(linies).toHaveLength(3);
  });
});

describe('targeta fosca dels textos del tancament', () => {
  it.each([
    ['tancament', { tipus: 'tancament' }],
    ['tancament de Programació', { tipus: 'tancament-programacio', imatges: [], versio: true }],
  ])('el %s posa la invitació i el lloc dins d\'una targeta fosca', (_nom, diapositiva) => {
    const { container } = render(<Diapositiva sessio={SESSIO} diapositiva={diapositiva} />);
    const targeta = container.querySelector('.social-slide__targeta');
    expect(targeta).not.toBeNull();
    expect(targeta.textContent).toMatch(/Vine al/);
    expect(targeta.textContent).toMatch(/Teatre del Casino Municipal/);
    expect(targeta.textContent).toMatch(/cineclubrodadebera\.cat/);
    expect(targeta.querySelector('.social-slide__logo')).toBeNull();
  });
});

describe('Diapositiva tancament de Programació', () => {
  const tancament = { tipus: 'tancament-programacio', imatges: ['a', 'b', 'c', 'd'].map((i) => `https://x/${i}.jpg`), versio: true };

  it('porta la invitació, el lloc, la web i el logo, i un collage amb les imatges de les sessions', () => {
    const { container } = render(<Diapositiva sessio={{}} diapositiva={tancament} />);
    expect(screen.getByText(/Vine al/)).toBeInTheDocument();
    expect(screen.getByText('Teatre del Casino Municipal de Roda de Berà')).toBeInTheDocument();
    expect(screen.getByText('cineclubrodadebera.cat')).toBeInTheDocument();
    expect(screen.getByAltText('Cineclub Roda de Berà')).toBeInTheDocument();
    expect(container.querySelectorAll('.social-slide__negatiu img')).toHaveLength(4);
    expect(container.querySelector('.social-slide--tancament')).not.toBeNull();
  });

  it('diu «gaudeix del cinema en Versió Original» si totes les sessions són en versió original', () => {
    const { rerender } = render(<Diapositiva sessio={{}} diapositiva={tancament} />);
    expect(screen.getByText(/gaudeix del cinema/)).toBeInTheDocument();
    expect(screen.getByText('en Versió Original')).toBeInTheDocument();
    rerender(<Diapositiva sessio={{}} diapositiva={{ ...tancament, versio: false }} />);
    expect(screen.getByText(/gaudeix del cinema/)).toBeInTheDocument();
    expect(screen.queryByText(/Versió Original/)).not.toBeInTheDocument();
  });

  it('sense imatges no pinta cap collage', () => {
    const { container } = render(<Diapositiva sessio={{}} diapositiva={{ ...tancament, imatges: [] }} />);
    expect(container.querySelector('.social-slide__collage')).toBeNull();
  });
});

describe('Diapositiva d\'obertura de Programació', () => {
  const obertura = {
    tipus: 'obertura-programacio', format: 'fotogrames', imatges: ['a', 'b', 'c', 'd'].map((i) => `https://x/${i}.jpg`), interval: 'del 3 al 17 de desembre',
  };

  it('porta el títol «Programació», el rang de dates i un mosaic amb tots els cartells', () => {
    const { container } = render(<Diapositiva sessio={{ publica: {} }} diapositiva={obertura} />);
    expect(screen.getByText('Programació')).toBeInTheDocument();
    expect(screen.getByText('del 3 al 17 de desembre')).toBeInTheDocument();
    expect(container.querySelectorAll('.social-slide__tira-principal')).toHaveLength(4);
  });

  it('és una portada pròpia: cap franja, amb el logo del Cineclub i el títol grans', () => {
    const { container } = render(<Diapositiva sessio={{ publica: {} }} diapositiva={obertura} />);
    expect(container.querySelector('.social-slide__franja')).toBeNull();
    expect(container.querySelector('.social-slide--portada-programacio')).toBeNull();
    expect(container.querySelector('.social-slide--obertura .social-slide__obertura-capcalera img[alt="Cineclub Roda de Berà"]')).not.toBeNull();
    expect(container.querySelector('.social-slide__programacio').textContent).toBe('Programació');
  });

  it('els fotogrames van en tires de pel·lícula connectades: 4 fan dues tires de 2', () => {
    const { container } = render(<Diapositiva sessio={{ publica: {} }} diapositiva={obertura} />);
    const tires = [...container.querySelectorAll('.social-slide__tira')];
    expect(tires.map((t) => t.querySelectorAll('.social-slide__tira-principal').length)).toEqual([2, 2]);
    tires.forEach((t) => expect(t.querySelectorAll('.social-slide__perforacions')).toHaveLength(2));
  });

  it('cada tira té fotogrames als costats (es tallen per les vores) amb els extres, i es repeteixen si no n\'hi ha prou', () => {
    const extres = ['https://x/e1.jpg', 'https://x/e2.jpg'];
    const { container } = render(<Diapositiva sessio={{ publica: {} }} diapositiva={{ ...obertura, extres }} />);
    container.querySelectorAll('.social-slide__tira').forEach((t) => {
      const laterals = [...t.querySelectorAll('img:not(.social-slide__tira-principal)')];
      expect(laterals.length).toBeGreaterThanOrEqual(2);
      laterals.forEach((img) => expect(extres).toContain(img.getAttribute('src')));
    });
  });

  it('les tires de dos són més grans que les de tres', () => {
    const imatges = ['a', 'b', 'c', 'd', 'e'].map((i) => `https://x/${i}.jpg`);
    const { container } = render(<Diapositiva sessio={{ publica: {} }} diapositiva={{ ...obertura, imatges }} />);
    const [de3, de2] = [...container.querySelectorAll('.social-slide__tira')].map((t) => t.querySelector('.social-slide__tira-principal'));
    expect(container.querySelectorAll('.social-slide__tira')[0].querySelectorAll('.social-slide__tira-principal')).toHaveLength(3);
    expect(parseFloat(de2.style.width)).toBeGreaterThan(parseFloat(de3.style.width));
  });

  it('els cartells (sense fotogrames) es queden com a imatges soles, sense tires', () => {
    const { container } = render(<Diapositiva sessio={{ publica: {} }} diapositiva={{ ...obertura, format: 'cartells' }} />);
    expect(container.querySelectorAll('.social-slide__tira')).toHaveLength(0);
    expect(container.querySelectorAll('.social-slide__mosaic img')).toHaveLength(4);
  });

  it('usa les imatges ja convertides a data: i no peta sense imatges', () => {
    const { container, rerender } = render(<Diapositiva sessio={{ publica: {} }} diapositiva={obertura} imatges={{ 'https://x/a.jpg': 'data:image/jpeg;base64,AAA' }} />);
    expect(container.querySelector('.social-slide__tira-principal').getAttribute('src')).toBe('data:image/jpeg;base64,AAA');
    rerender(<Diapositiva sessio={{ publica: {} }} diapositiva={{ ...obertura, imatges: [] }} />);
    expect(container.querySelectorAll('.social-slide__tira')).toHaveLength(0);
  });
});

describe('portada d\'una pel·lícula', () => {
  const portada = { tipus: 'portada-pelicula' };

  it('és una diapositiva pròpia: no comparteix classes amb la portada de Programació (franges) i no en té', () => {
    const { container } = render(<Diapositiva sessio={SESSIO} diapositiva={portada} />);
    expect(container.querySelector('.social-slide--portada-pelicula')).not.toBeNull();
    expect(container.querySelector('.social-slide--portada-programacio')).toBeNull();
    expect(container.querySelector('.social-slide__franja')).toBeNull();
    expect(container.querySelector('[class*="social-slide__logo--peu-programacio"]')).toBeNull();
    expect(container.querySelector('.social-slide__marc')).toBeNull();
    expect(container.querySelector('.social-slide__cartell')).toBeNull();
  });

  it('porta el logo del Cineclub, el dia i l\'hora grans i el cartell, sense lloc ni «Propera sessió»', () => {
    const { container } = render(<Diapositiva sessio={SESSIO} diapositiva={portada} />);
    expect(container.querySelector('.social-slide__pelicula-capcalera img[alt="Cineclub Roda de Berà"]')).not.toBeNull();
    expect(screen.getByText("Dijous 22 d'octubre")).toBeInTheDocument();
    expect(screen.getByText('19:00h')).toBeInTheDocument();
    expect(screen.getByAltText('Pig')).toHaveAttribute('src', 'https://x/cartell.jpg');
    expect(screen.queryByText('Teatre del Casino Municipal de Roda de Berà')).not.toBeInTheDocument();
    expect(screen.queryByText('Propera sessió')).not.toBeInTheDocument();
  });

  const ambGaleria = (n) => ({ ...SESSIO, publica: { ...SESSIO.publica, galeria: Array.from({ length: n }, (_, i) => `https://x/g${i}.jpg`) } });

  it('té de fons tires de pel·lícula amb els fotogrames de la pel·lícula, i el cartell hi va a sobre', () => {
    const { container } = render(<Diapositiva sessio={ambGaleria(4)} diapositiva={portada} />);
    const fons = container.querySelector('.social-slide__fons-tires');
    expect(fons).not.toBeNull();
    expect(fons.querySelectorAll('.social-slide__tira')).toHaveLength(2);
    // opaques (sense vel) i amb el mosaic de fons darrere
    expect(container.querySelector('.social-slide__fons-vel')).toBeNull();
    expect(container.querySelector('.social-slide__fons')).not.toBeNull();
    fons.querySelectorAll('.social-slide__tira-imatge').forEach((img) => expect(img.getAttribute('src')).toMatch(/^https:\/\/x\/g[0-3]\.jpg$/));
    const contingut = container.querySelector('.social-slide__contingut');
    expect(fons.compareDocumentPosition(contingut) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('els 4 fotogrames que es veuen (no tapats pel cartell) són diferents', () => {
    const { container } = render(<Diapositiva sessio={ambGaleria(4)} diapositiva={portada} />);
    const vistos = [...container.querySelectorAll('.social-slide__tira-imatge--vista')].map((i) => i.getAttribute('src'));
    expect(vistos).toHaveLength(4);
    expect(new Set(vistos).size).toBe(4);
  });

  it('amb només dos fotogrames, la tira de sota els porta invertits perquè es noti menys', () => {
    const { container } = render(<Diapositiva sessio={ambGaleria(2)} diapositiva={portada} />);
    const [dalt, baix] = [...container.querySelectorAll('.social-slide__fons-tires .social-slide__tira')]
      .map((t) => [...t.querySelectorAll('.social-slide__tira-imatge--vista')].map((i) => i.getAttribute('src')));
    expect(dalt).toHaveLength(2);
    expect(baix).toEqual([...dalt].reverse());
    expect(baix[0]).not.toBe(dalt[0]);
  });

  it('sense galeria no hi ha tires de fons', () => {
    const { container } = render(<Diapositiva sessio={SESSIO} diapositiva={portada} />);
    expect(container.querySelector('.social-slide__fons-tires')).toBeNull();
  });

  it('el dia i l\'hora van en una sola línia, i la lletra s\'encongeix si la data és llarga', () => {
    const mida = (data) => {
      const { container, unmount } = render(<Diapositiva sessio={{ ...SESSIO, data }} diapositiva={portada} />);
      const quan = container.querySelector('.social-slide__pelicula-quan');
      const resultat = { text: quan.textContent, mida: parseFloat(quan.style.fontSize) };
      unmount();
      return resultat;
    };
    const curta = mida('2026-10-22');
    const llarga = mida('2026-12-30');
    expect(curta.text).toBe("Dijous 22 d'octubre 19:00h");
    expect(llarga.text).toBe('Dimecres 30 de desembre 19:00h');
    expect(llarga.mida).toBeLessThan(curta.mida);
    expect(curta.mida).toBeLessThanOrEqual(84);
  });

  it('la pastilla del tipus de sessió va a l\'esquerra de la franja blanca, amb el color de la secció', () => {
    const { container, rerender } = render(<Diapositiva sessio={SESSIO} diapositiva={portada} />);
    const pastilla = container.querySelector('.social-slide__pelicula-franja .social-slide__seccio-pelicula');
    expect(pastilla.textContent).toBe('Cartellera');
    expect(pastilla.style.backgroundColor).toBe('rgb(191, 144, 0)');
    rerender(<Diapositiva sessio={{ ...SESSIO, publica: { ...SESSIO.publica, seccio: 'xarxa' } }} diapositiva={portada} />);
    const xarxa = container.querySelector('.social-slide__pelicula-franja .social-slide__seccio-pelicula');
    expect(xarxa.textContent).toBe('Xarxa');
    expect(xarxa.style.backgroundColor).toBe('rgb(47, 111, 118)');
  });

  it('les altres diapositives (curiositat, tancament) no porten la pastilla', () => {
    ['curiositat', 'tancament'].forEach((tipus) => {
      const { container, unmount } = render(<Diapositiva sessio={SESSIO} diapositiva={{ tipus, text: 'T', imatge: null }} />);
      expect(container.querySelector('[class*="social-slide__seccio-"]')).toBeNull();
      unmount();
    });
  });

  it('porta el filet gris discontinu sota la franja de dalt, per darrere del logo del Cineclub (com la resta de dissenys)', () => {
    const { container } = render(<Diapositiva sessio={SESSIO} diapositiva={portada} />);
    const franja = container.querySelector('.social-slide__pelicula-franja');
    const filet = container.querySelector('.social-slide__pelicula-filet');
    const contingut = container.querySelector('.social-slide__contingut');
    expect(filet).not.toBeNull();
    expect(filet).toHaveAttribute('aria-hidden', 'true');
    expect(franja.compareDocumentPosition(filet) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // el logo és dins del contingut, que va després: es pinta damunt del filet
    expect(filet.compareDocumentPosition(contingut) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(contingut.querySelector('img[alt="Cineclub Roda de Berà"]')).not.toBeNull();
  });

  it('les altres portades de pel·lícula (curiositat, tancament) no porten aquest filet', () => {
    ['curiositat', 'tancament'].forEach((tipus) => {
      const { container, unmount } = render(<Diapositiva sessio={SESSIO} diapositiva={{ tipus, text: 'T', imatge: null }} />);
      expect(container.querySelector('.social-slide__pelicula-filet')).toBeNull();
      unmount();
    });
  });

  it('té una franja blanca a dalt, per darrere del logo del Cineclub', () => {
    const { container } = render(<Diapositiva sessio={SESSIO} diapositiva={portada} />);
    const franja = container.querySelector('.social-slide__pelicula-franja');
    const contingut = container.querySelector('.social-slide__contingut');
    expect(franja).not.toBeNull();
    expect(franja.querySelector('img')).toBeNull(); // la pastilla és text, no una imatge
    expect(franja.compareDocumentPosition(contingut) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(contingut.querySelector('.social-slide__pelicula-capcalera img[alt="Cineclub Roda de Berà"]')).not.toBeNull();
  });

  it('la franja és pastilla + degradat + bloc blanc de la distribuïdora (aquest, només si n\'hi ha), en aquest ordre', () => {
    const { container, rerender } = render(<Diapositiva sessio={ambGaleria(3)} diapositiva={portada} distribuidora="https://x/d.png" />);
    const franja = container.querySelector('.social-slide__pelicula-franja');
    expect([...franja.children].map((c) => c.className)).toEqual([
      'social-slide__seccio-pelicula', 'social-slide__pelicula-degradat', 'social-slide__pelicula-distribuidora',
    ]);
    expect(franja.lastElementChild.querySelector('img[src="https://x/d.png"]')).not.toBeNull();
    rerender(<Diapositiva sessio={ambGaleria(3)} diapositiva={portada} />);
    expect([...container.querySelector('.social-slide__pelicula-franja').children].map((c) => c.className)).toEqual([
      'social-slide__seccio-pelicula', 'social-slide__pelicula-degradat',
    ]);
  });

  it('els col·laboradors surten a l\'extrem inferior esquerre, només si n\'hi ha, amb el seu text', () => {
    const { container, rerender } = render(<Diapositiva sessio={SESSIO} diapositiva={portada} />);
    expect(container.querySelector('.social-slide__pelicula-colabora')).toBeNull();
    rerender(<Diapositiva sessio={SESSIO} diapositiva={portada} logos={['https://x/aj.png']} />);
    const colabora = container.querySelector('.social-slide__pelicula-colabora');
    expect(colabora.querySelector('img[src="https://x/aj.png"]')).not.toBeNull();
    expect(colabora.textContent).toMatch(/Amb la col·laboració de/);
  });

  it('sense col·laboradors ni distribuïdora no hi ha cap logo a les cantonades', () => {
    const { container } = render(<Diapositiva sessio={SESSIO} diapositiva={portada} />);
    expect(container.querySelector('.social-slide__pelicula-distribuidora')).toBeNull();
    expect(container.querySelector('.social-slide__pelicula-colabora')).toBeNull();
  });

  it('només amb distribuïdora no diu «Amb la col·laboració de»', () => {
    render(<Diapositiva sessio={SESSIO} diapositiva={portada} distribuidora="https://x/d.png" />);
    expect(screen.queryByText(/col·laboració/)).not.toBeInTheDocument();
  });

  it('sense cartell mostra el títol i usa les imatges ja convertides a data:', () => {
    const { rerender } = render(<Diapositiva sessio={{ ...SESSIO, publica: { titol: 'Pig' } }} diapositiva={portada} />);
    expect(screen.getByText('Pig')).toBeInTheDocument();
    rerender(<Diapositiva sessio={SESSIO} diapositiva={portada} imatges={{ 'https://x/cartell.jpg': 'data:image/jpeg;base64,AAA' }} />);
    expect(screen.getByAltText('Pig')).toHaveAttribute('src', 'data:image/jpeg;base64,AAA');
  });
});
