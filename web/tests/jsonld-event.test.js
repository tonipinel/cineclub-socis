import { describe, it, expect } from 'vitest';
import { eventJsonLd, descripcioEvent, idiomesDe } from '../src/lib/jsonld-event.js';

const BASE = 'https://cineclubrodadebera.cat';
const STORAGE = 'https://firebasestorage.googleapis.com/v0/b/cineclub-socis.firebasestorage.app/o/web%2Fsessions%2Fpig%2F';

const pig = {
  titol: 'Pig',
  slug: 'pig',
  data: '2026-06-25',
  hora: '19:00',
  publica: {
    titolOriginal: 'Pig',
    durada: 92,
    idioma: 'Anglès',
    preu: 5,
    organitza: 'cineclub',
    sinopsiCartell: "En Rob és un xef d'alta cuina.<br/><br/>Un viatge profund.",
    cartell: `${STORAGE}poster.jpg?alt=media`,
    galeria: [`${STORAGE}gallery-1.jpg?alt=media`, `${STORAGE}gallery-2.jpg?alt=media`],
    cos: "## Sinopsi\n\nText del cos.\n",
  },
};
const ev = (sessio = pig) => eventJsonLd(sessio, BASE);
const ambPublica = (canvis) => ({ ...pig, publica: { ...pig.publica, ...canvis } });

describe('eventJsonLd: text pla i preu', () => {
  it('les etiquetes en línia s\'eliminen sense espai i només <br> i els blocs en posen', () => {
    const d = (sinopsiCartell) => descripcioEvent(ambPublica({ sinopsiCartell }));
    expect(d('Barot<em>.</em> <em>&ldquo;Executada&rdquo;</em>')).toBe('Barot. “Executada”');
    expect(d('Un<strong>a</strong> pel·lícula')).toBe('Una pel·lícula');
    expect(d('Una<br>altra<br/>cosa')).toBe('Una altra cosa');
    expect(d('<p>Primer</p><p>Segon</p>')).toBe('Primer Segon');
  });
  it('sense preu no s\'emet offers.price (mai "undefined")', () => {
    for (const preu of [undefined, null, '']) {
      const e = ev(ambPublica({ preu }));
      expect(e.offers).not.toHaveProperty('price');
      expect(JSON.stringify(e)).not.toContain('undefined');
    }
    expect(ev(ambPublica({ preu: 0 })).offers.price).toBe('0');
  });
});

describe('eventJsonLd: claus de Hugo (no han de canviar)', () => {
  it('manté tots els valors que emet Hugo', () => {
    expect(ev()).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'ScreeningEvent',
      location: { '@type': 'Place', address: 'Plaça dels Pins, 6, 43883 Roda de Berà (Tarragona)', name: 'Teatre del Casino Municipal de Roda de Berà' },
      name: 'Pig',
      offers: { '@type': 'Offer', price: '5', priceCurrency: 'EUR', url: `${BASE}/programacio/2026/pig/` },
      startDate: '2026-06-25T19:00:00+02:00',
      workPresented: { '@type': 'Movie', name: 'Pig' },
    });
  });

  it('el preu és text i el títol de l\'obra és el títol original si n\'hi ha', () => {
    const e = ev({ ...pig, titol: 'Porc', publica: { ...pig.publica, titolOriginal: undefined, titol: 'Porc', preu: 0 } });
    expect(e.offers.price).toBe('0');
    expect(e.workPresented.name).toBe('Porc');
  });

  it('serialitza amb les claus en ordre alfabètic (com el jsonify de Hugo)', () => {
    const claus = Object.keys(ev());
    expect(claus).toEqual([...claus].sort());
    expect(Object.keys(ev().offers)).toEqual([...Object.keys(ev().offers)].sort());
  });
});

describe('eventJsonLd: camps recomanats per Google', () => {
  it('eventStatus i eventAttendanceMode (sessions presencials)', () => {
    expect(ev().eventStatus).toBe('https://schema.org/EventScheduled');
    expect(ev().eventAttendanceMode).toBe('https://schema.org/OfflineEventAttendanceMode');
  });

  it('offers.availability InStock i cap validFrom', () => {
    expect(ev().offers.availability).toBe('https://schema.org/InStock');
    expect(ev().offers).not.toHaveProperty('validFrom');
  });

  it('description: la sinopsi del cartell en text pla (sense <br/>)', () => {
    expect(ev().description).toBe("En Rob és un xef d'alta cuina. Un viatge profund.");
  });

  it('description: sense sinopsi del cartell, el primer paràgraf del cos en text pla', () => {
    const cos = "## Sinopsi\n\nEn Rob és un **xef** d'alta [cuina](https://exemple.cat) &amp; més…\n\nSegon paràgraf.";
    expect(ev(ambPublica({ sinopsiCartell: undefined, cos })).description).toBe('En Rob és un xef d’alta cuina & més…');
  });

  it('description: s\'omet si no hi ha cap text', () => {
    expect(ev(ambPublica({ sinopsiCartell: undefined, cos: '## Només un títol' }))).not.toHaveProperty('description');
    expect(ev(ambPublica({ sinopsiCartell: '  ', cos: undefined }))).not.toHaveProperty('description');
  });

  it('description: màxim ~300 caràcters, tallat per paraula i amb punts suspensius', () => {
    const llarga = Array.from({ length: 120 }, (_, i) => `paraula${i}`).join(' ');
    const d = ev(ambPublica({ sinopsiCartell: llarga })).description;
    expect(d.length).toBeLessThanOrEqual(300);
    expect(d.endsWith('…')).toBe(true);
    expect(llarga.startsWith(d.slice(0, -1).trimEnd())).toBe(true);
    expect(llarga.split(' ')).toContain(d.slice(0, -1).split(' ').pop());
  });

  it('description: un text de fins a 300 caràcters es deixa tal qual', () => {
    const exacte = 'a'.repeat(300);
    expect(ev(ambPublica({ sinopsiCartell: exacte })).description).toBe(exacte);
  });

  it('image: cartell i primera imatge de la galeria, URL absolutes', () => {
    expect(ev().image).toEqual([`${STORAGE}poster.jpg?alt=media`, `${STORAGE}gallery-1.jpg?alt=media`]);
  });

  it('image: només el que hi ha, absolutitzant els camins relatius i sense repetits', () => {
    expect(ev(ambPublica({ galeria: [] })).image).toEqual([`${STORAGE}poster.jpg?alt=media`]);
    expect(ev(ambPublica({ cartell: undefined })).image).toEqual([`${STORAGE}gallery-1.jpg?alt=media`]);
    expect(ev(ambPublica({ cartell: '/images/p.jpg', galeria: ['/images/p.jpg'] })).image).toEqual([`${BASE}/images/p.jpg`]);
    expect(ev(ambPublica({ cartell: undefined, galeria: undefined }))).not.toHaveProperty('image');
  });

  it('endDate: l\'inici més la durada en minuts, amb l\'ofset de Madrid', () => {
    expect(ev().endDate).toBe('2026-06-25T20:32:00+02:00');
  });

  it('endDate: passa de mitjanit i canvia d\'ofset (canvi d\'hora) correctament', () => {
    expect(ev({ ...pig, data: '2026-06-25', hora: '23:00' }).endDate).toBe('2026-06-26T00:32:00+02:00');
    expect(ev({ ...pig, data: '2026-03-28', hora: '23:30', publica: { ...pig.publica, durada: 180 } }).endDate).toBe('2026-03-29T03:30:00+02:00');
  });

  it('endDate: s\'omet sense durada, amb durada 0 o no numèrica', () => {
    for (const durada of [undefined, 0, -5, 'molta', null]) expect(ev(ambPublica({ durada })), String(durada)).not.toHaveProperty('endDate');
  });

  it('endDate: accepta una durada numèrica en text', () => {
    expect(ev(ambPublica({ durada: '90' })).endDate).toBe('2026-06-25T20:30:00+02:00');
  });
});

describe('eventJsonLd: organizer', () => {
  it('sessions del cineclub: Organization amb el nom i la URL del web', () => {
    expect(ev().organizer).toEqual({ '@type': 'Organization', name: 'Cineclub Roda de Berà', url: `${BASE}/` });
    expect(ev(ambPublica({ organitza: undefined })).organizer.name).toBe('Cineclub Roda de Berà');
  });

  it('sessions organitzades per una altra entitat: el seu nom (i la seva web si es coneix)', () => {
    expect(ev(ambPublica({ organitza: "L'Ateneu Rodenc" })).organizer).toEqual(
      expect.objectContaining({ '@type': 'Organization', name: "L'Ateneu Rodenc" }),
    );
    expect(ev(ambPublica({ organitza: 'Entitat Desconeguda' })).organizer).toEqual({ '@type': 'Organization', name: 'Entitat Desconeguda' });
  });
});

describe('eventJsonLd: inLanguage', () => {
  it('codi BCP 47 de l\'idioma quan es coneix', () => {
    expect(ev().inLanguage).toBe('en');
    expect(ev(ambPublica({ idioma: 'Català' })).inLanguage).toBe('ca');
    expect(ev(ambPublica({ idioma: 'Suec' })).inLanguage).toBe('sv');
  });

  it('diversos idiomes: llista de codis', () => {
    expect(ev(ambPublica({ idioma: 'Castellà, Francès i Català' })).inLanguage).toEqual(['es', 'fr', 'ca']);
  });

  it('s\'omet si no hi ha idioma o no es reconeix del tot (no s\'inventa res)', () => {
    expect(ev(ambPublica({ idioma: undefined }))).not.toHaveProperty('inLanguage');
    expect(ev(ambPublica({ idioma: 'Pel·lícula muda (intertítols en anglès)' }))).not.toHaveProperty('inLanguage');
    expect(ev(ambPublica({ idioma: 'Castellà i klingon' }))).not.toHaveProperty('inLanguage');
  });
});

describe('descripcioEvent i idiomesDe (helpers)', () => {
  it('descripcioEvent decodifica entitats i col·lapsa els espais', () => {
    expect(descripcioEvent({ publica: { sinopsiCartell: 'A &amp; B&nbsp;&mdash; C\n\n  D <b>E</b>' } })).toBe('A & B — C D E');
  });
  it('idiomesDe', () => {
    expect(idiomesDe('Anglès')).toEqual(['en']);
    expect(idiomesDe('basc i francès')).toEqual(['eu', 'fr']);
    expect(idiomesDe('')).toEqual([]);
    expect(idiomesDe('Xinès')).toEqual([]);
  });
});
