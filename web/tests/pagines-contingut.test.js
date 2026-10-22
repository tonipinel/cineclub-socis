import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import RutaContingut from '../src/pages/[slug].astro';
import FesTeSocia from '../src/pages/fes-te-socia/index.astro';
import Pagina404 from '../src/pages/404.astro';
import { normalitza } from './helpers/html.js';

vi.mock('../src/lib/db.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDb: () => globalThis.__dbFals,
}));

const llegeix = (nom) => readFileSync(new URL(`./fixtures/${nom}`, import.meta.url), 'utf8');
const faqHugo = JSON.parse(llegeix('hugo-faq.json'));
const privacitatHugo = JSON.parse(llegeix('hugo-privacitat.json'));
const ST = 'https://firebasestorage.googleapis.com/v0/b/cineclub-socis.firebasestorage.app/o/web%2Fpagines%2F';

const pagines = {
  'preguntes-frequents': {
    slug: 'preguntes-frequents',
    tipus: 'faq',
    titol: 'Preguntes freqüents',
    dades: { hook: "Resolem els dubtes més habituals sobre el Cineclub i com fer-te'n sòcia o soci.", faq: faqHugo.map(({ pregunta, resposta }) => ({ pregunta, resposta })) },
    cos: '',
    imatges: {},
  },
  privacitat: {
    slug: 'privacitat',
    tipus: 'contingut',
    titol: 'Política de privacitat',
    dades: { description: 'Política de privacitat del Cineclub Roda de Berà: com tractem i protegim les teves dades personals.' },
    cos: privacitatHugo.cos,
    imatges: {},
  },
  portada: { slug: 'portada', tipus: 'portada', titol: 'Cineclub Roda de Berà', dades: {}, cos: 'x', imatges: {} },
  'fes-te-socia': {
    slug: 'fes-te-socia',
    tipus: 'socia',
    titol: 'Fes-te sòcia/soci',
    dades: {
      hook: 'No és només veure una pel·lícula.',
      blocks: [
        { imatge: 'foto-public.jpg', costat: 'dreta', titol1: 'Cinema en companyia,', titol2: 'i en pantalla gran', text: "Veure una bona pel·lícula d'estrena.\n" },
        { imatge: 'foto-colloqui.jpg', costat: 'esquerra', titol1: 'Més enllà', titol2: 'de la pantalla', text: 'Cada projecció va seguida d\'un col·loqui.\n' },
        { imatge: 'foto-tauler.jpg', costat: 'dreta', titol1: 'Una programació', titol2: 'que tu construeixes', text: 'Com a sòcia.\n\nI **més**.\n' },
        { imatge: 'no-existeix.jpg', costat: 'esquerra', titol1: 'Sense', titol2: 'imatge', text: 'Text.\n' },
      ],
      benefits: [
        { icona: 'film', text: 'Un mínim de 12 projeccions anuals' },
        { icona: 'calendar', text: "Programació anunciada amb 2-3 mesos d'antelació" },
      ],
      signup_image: 'foto-inscripcio.jpg',
      signup_titol1: 'Comença',
      signup_titol2: 'avui mateix',
      closing_titol: 'Fes-ho realitat',
      closing_hook: 'Cada sòcia i soci compta.',
    },
    cos: "Si prefereixes provar-ho abans de comprometre't, pots venir.",
    imatges: Object.fromEntries(['foto-public', 'foto-colloqui', 'foto-tauler', 'foto-inscripcio'].map((n) => [`${n}.jpg`, `${ST}${n}.jpg?alt=media`])),
  },
};

const ambDb = (docs = pagines) => {
  globalThis.__dbFals = {
    collection: (nom) => ({
      get: async () => ({ docs: [] }),
      doc: (id) => ({ get: async () => ({ exists: nom === 'pagines' && !!docs[id], data: () => docs[nom === 'pagines' ? id : ''] }) }),
    }),
  };
};
const renderitza = async (Ruta, ruta, params) => {
  const container = await AstroContainer.create();
  container.insertPageRoute('/404', Pagina404);
  const resposta = await container.renderToResponse(Ruta, { routeType: 'page', params, request: new Request(`https://cineclub-web.web.app${ruta}`) });
  return { status: resposta.status, html: await resposta.text() };
};
const contingut = (slug) => renderitza(RutaContingut, `/${slug}/`, { slug });

beforeEach(() => ambDb());

describe('/preguntes-frequents/', () => {
  it('té el títol, la descripció (hook) i el canonical de Hugo', async () => {
    const { status, html } = await contingut('preguntes-frequents');
    expect(status).toBe(200);
    expect(html).toContain('<title>Preguntes freqüents · Cineclub Roda de Berà</title>');
    expect(html).toContain('<meta name="description" content="Resolem els dubtes més habituals sobre el Cineclub i com fer-te\'n sòcia o soci.">');
    expect(html).toContain('<link rel="canonical" href="https://cineclub-web.web.app/preguntes-frequents/">');
    expect(html).toContain('<meta property="og:title" content="Preguntes freqüents">');
    expect(html).toContain('<h1 class="page-hero__title">Preguntes freqüents</h1><p class="page-hero__hook">Resolem els dubtes');
  });

  it('pinta les 16 preguntes amb les respostes en Markdown idèntiques a les de Hugo', async () => {
    const { html } = await contingut('preguntes-frequents');
    const items = [...html.matchAll(/<details class="faq__item"><summary class="faq__question">(.*?)<\/summary><div class="faq__answer prose-ca">([^]*?)<\/div><\/details>/g)];
    expect(items).toHaveLength(16);
    items.forEach(([, pregunta, resposta], i) => {
      expect(pregunta.replace(/&#39;/g, "'")).toBe(faqHugo[i].pregunta);
      expect(normalitza(resposta), faqHugo[i].pregunta).toBe(normalitza(faqHugo[i].html));
    });
  });

  it('emet el JSON-LD FAQPage amb totes les preguntes, byte a byte com Hugo', async () => {
    const { html } = await contingut('preguntes-frequents');
    const json = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)[1];
    expect(json).toBe(llegeix('hugo-faq-jsonld.txt'));
    expect(JSON.parse(json).mainEntity).toHaveLength(16);
  });

  it('el JSON-LD és al head', async () => {
    const { html } = await contingut('preguntes-frequents');
    expect(html.indexOf('application/ld+json')).toBeLessThan(html.indexOf('</head>'));
  });

  it('tolera una FAQ sense preguntes o amb valors nuls', async () => {
    ambDb({ ...pagines, 'preguntes-frequents': { ...pagines['preguntes-frequents'], dades: { faq: null } } });
    const { status, html } = await contingut('preguntes-frequents');
    expect(status).toBe(200);
    expect(html).not.toContain('faq__item');
    expect(html).toContain('"mainEntity":[]');
    expect(html).toContain('<meta name="description" content="Un espai per viure');
  });
});

describe('/privacitat/', () => {
  it('té el títol, la descripció de `description` i cap hook al hero', async () => {
    const { status, html } = await contingut('privacitat');
    expect(status).toBe(200);
    expect(html).toContain('<title>Política de privacitat · Cineclub Roda de Berà</title>');
    expect(html).toContain('<meta name="description" content="Política de privacitat del Cineclub Roda de Berà: com tractem i protegim les teves dades personals.">');
    expect(html).toContain('<section class="page-hero"><h1 class="page-hero__title">Política de privacitat</h1></section>');
  });

  it('el cos en Markdown és idèntic al de Hugo', async () => {
    const { html } = await contingut('privacitat');
    const cos = html.match(/<div class="page-body prose-ca">([^]*?)<\/div><\/main>/)[1];
    expect(normalitza(cos)).toBe(normalitza(privacitatHugo.html));
  });

  it('sense `description` cau en la del web', async () => {
    ambDb({ ...pagines, privacitat: { ...pagines.privacitat, dades: {} } });
    expect((await contingut('privacitat')).html).toContain('<meta name="description" content="Un espai per viure');
  });
});

describe('/<slug>/ només serveix les pàgines de contingut', () => {
  it('un slug desconegut és un 404 real', async () => {
    const { status, html } = await contingut('no-existeix');
    expect(status).toBe(404);
    expect(html).toContain('Pàgina no trobada');
  });
  it('una pàgina de Firestore que no és de la llista (portada, fes-te-socia) és un 404', async () => {
    expect((await contingut('portada')).status).toBe(404);
    expect((await contingut('fes-te-socia')).status).toBe(404);
  });
  it('una pàgina de la llista que no és a Firestore és un 404', async () => {
    ambDb({});
    expect((await contingut('privacitat')).status).toBe(404);
  });
  it('un slug desconegut no llegeix Firestore', async () => {
    const llegir = vi.fn();
    globalThis.__dbFals = { collection: () => ({ doc: () => ({ get: llegir }) }) };
    await contingut('qualsevol-cosa');
    expect(llegir).not.toHaveBeenCalled();
  });
});

describe('/fes-te-socia/', () => {
  const pagina = () => renderitza(FesTeSocia, '/fes-te-socia/');
  const url = (nom) => `/api/img.webp?w=700&amp;u=${encodeURIComponent(`${ST}${nom}.jpg?alt=media`)}`;

  it('la descripció prefereix `description` al hook', async () => {
    ambDb({ ...pagines, 'fes-te-socia': { ...pagines['fes-te-socia'], dades: { ...pagines['fes-te-socia'].dades, description: 'Descripció pròpia.' } } });
    const { html } = await pagina();
    expect(html).toContain('<meta name="description" content="Descripció pròpia.">');
    expect(html).toContain('<p class="page-hero__hook">No és només veure una pel·lícula.</p>');
  });

  it('té el títol, la descripció (hook), el menú actiu i el botó d\'inscripció', async () => {
    const { status, html } = await pagina();
    expect(status).toBe(200);
    expect(html).toContain('<title>Fes-te sòcia/soci · Cineclub Roda de Berà</title>');
    expect(html).toContain('<meta name="description" content="No és només veure una pel·lícula.">');
    expect(html).toContain('class="site-header__link site-header__link--active" href="/fes-te-socia/">Fes-te soci/a</a>');
    expect(html).toContain('<a class="btn btn--join" href="/fes-te-socia/#inscriu-te">');
    expect(html).toContain('<a class="floating-cta" href="/fes-te-socia/#inscriu-te">');
  });

  it('pinta els beneficis amb la seva icona', async () => {
    const { html } = await pagina();
    expect(html).toContain('<h2>Què hi guanyes <span class="text-gold">fent-te sòcia o soci</span></h2>');
    expect(html.match(/class="info-item"/g)).toHaveLength(2);
    expect(html).toContain('icon--film');
    expect(html).toContain('<p class="info-item__caption">Programació anunciada amb 2-3 mesos d\'antelació</p>');
  });

  it('alterna els blocs (alt als parells, reverse a l\'esquerra) i redimensiona a 700', async () => {
    const { html } = await pagina();
    const blocs = [...html.matchAll(/<div class="member-block-wrapper( member-block-wrapper--alt)?"><div class="member-block( member-block--reverse)?">/g)];
    expect(blocs.map((m) => [!!m[1], !!m[2]])).toEqual([[true, false], [false, true], [true, false], [false, true]]);
    expect(html).toContain(`<img class="member-block__image" src="${url('foto-public')}" alt="">`);
    expect(html).toContain(`<img class="member-signup__image" src="${url('foto-inscripcio')}" alt="">`);
  });

  it('un bloc sense la seva imatge no la pinta', async () => {
    const { html } = await pagina();
    expect(html.match(/class="member-block__image"/g)).toHaveLength(3);
    expect(html).toContain('<h2>Sense<br><span class="text-gold">imatge</span></h2>');
  });

  it('el text dels blocs és markdownify (sense <p> si és un sol paràgraf) i el cos és Markdown', async () => {
    const { html } = await pagina();
    expect(html).toContain('</h2>Veure una bona pel·lícula d&rsquo;estrena.</div>');
    expect(html).toContain('<p>Com a sòcia.</p>');
    expect(html).toContain('<h2>Comença<br><span class="text-gold">avui mateix</span></h2><p>Si prefereixes provar-ho abans de comprometre&rsquo;t, pots venir.</p>');
  });

  it('inclou el formulari amb tots els camps i el script de Firestore sense tocar', async () => {
    const { html } = await pagina();
    expect(html).toContain('<form class="signup-form" data-fes-te-socia-form novalidate>');
    for (const camp of ['nom', 'cognoms', 'dni', 'poblacio', 'codiPostal', 'telefon', 'correuElectronic', 'senseEmail', 'comentaris', 'acceptaPrivacitat', 'acceptaDadesPersonals']) {
      expect(html, camp).toContain(`name="${camp}"`);
    }
    expect(html).toContain('data-email-field');
    expect(html).toContain('<p class="signup-form__error" data-form-error></p>');
    expect(html).toContain('<button class="btn" type="submit" data-form-submit>Enviar sol·licitud</button>');
    expect(html).toContain('data-form-confirmacio hidden>');
    expect(html).toContain('<script type="module" src="/js/fes-te-socia-form.js"></script>');
    expect(html).toContain('id="inscriu-te"');
  });

  it('el script de la barra flotant és el de Hugo', async () => {
    const { html } = await pagina();
    expect(html).toContain('var bar = document.querySelector("[data-floating-cta]");');
    expect(html).toContain('bar.classList.add("floating-cta-bar--visible");');
  });

  it('sense pagines/fes-te-socia és un 404', async () => {
    ambDb({});
    expect((await pagina()).status).toBe(404);
  });

  it('tolera blocs, beneficis i imatges nuls', async () => {
    ambDb({ ...pagines, 'fes-te-socia': { ...pagines['fes-te-socia'], dades: { blocks: null, benefits: null }, imatges: null, cos: null } });
    const { status, html } = await pagina();
    expect(status).toBe(200);
    expect(html).not.toContain('member-block__image');
    expect(html).toContain('data-fes-te-socia-form');
  });
});
