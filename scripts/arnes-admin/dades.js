// Dades inventades i ADVERSES per a l'arnès de l'administració: títols, noms, correus i URL molt
// llargs (alguns sense cap espai), molts registres i imports grans. No surten de producció.
// Les claus són camins de Firestore ('col/id' o 'col/id/subcol/id').

export class Timestamp {
  constructor(ms) { this.ms = ms; }
  static now() { return new Timestamp(Date.now()); }
  static fromDate(data) { return new Timestamp(data.getTime()); }
  static fromMillis(ms) { return new Timestamp(ms); }
  toDate() { return new Date(this.ms); }
  toMillis() { return this.ms; }
  get seconds() { return Math.floor(this.ms / 1000); }
  get nanoseconds() { return 0; }
}

const DIA = 24 * 60 * 60 * 1000;
const ara = Date.now();
const ts = (diesEnrere, hora = 19, minut = 0) => {
  const d = new Date(ara - diesEnrere * DIA);
  d.setHours(hora, minut, 0, 0);
  return new Timestamp(d.getTime());
};
const iso = (diesEnrere) => new Date(ara - diesEnrere * DIA).toLocaleDateString('sv-SE');

const URL_LLARGA = 'https://www.distribuidora-de-cinema-independent-i-classic-del-mediterrani.example/cataleg/pellicules/restauracions-4k/versio-original-subtitulada/fitxa-tecnica-completa?referencia=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const CORREU_LLARG = 'programacio.i.drets.de.projeccio.publica@distribuidora-de-cinema-independent-i-classic.example';
const PARAULA_LLARGA = 'Supercalifragilisticexpialidocious-Anticonstitucionalissimament-Electroencefalografistes';
// Cartell més ample que qualsevol mòbil (SVG en línia: no fa cap petició).
const CARTELL_AMPLE = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#BF9000"/><text x="40" y="460" font-size="120">CARTELL AMPLE</text></svg>')}`;
const CARTELL_VERTICAL = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="400" height="600" fill="#1f3a5f"/><text x="30" y="320" font-size="48" fill="#fff">CARTELL 2:3</text></svg>')}`;

const TITOLS = [
  'Els paraigües de Cherbourg: edició restaurada i remasteritzada en 4K amb material inèdit',
  'Dr. Strangelove o: com vaig aprendre a deixar de preocupar-me i estimar la bomba',
  `${PARAULA_LLARGA}: la pel·lícula`,
  'Hotel Budapest',
  'L\'any passat a Marienbad (L\'Année dernière à Marienbad), versió original subtitulada en català',
  'Retrat d\'una dona en flames',
  'Tot sobre la meva mare',
  'La gran bellesa: una història de Roma i dels seus habitants més excèntrics i oblidats',
];

const NOMS = ['Maria Montserrat Immaculada', 'Joan', 'Bartomeu-Ferran', 'Anna', 'Maximilià Esteve', 'Laia'];
const COGNOMS = [
  'Puigdollers-Vallverdú i Casademunt de la Torre',
  'Garcia',
  'Rodríguez-Fernández de Castro-Villaverde',
  'Soler i Font',
  'Xirinachs-Bellmunt',
  'Llorens',
];

export function dadesInicials() {
  const d = {};

  // --- Socis (60): el primer té tots els camps extrems.
  for (let i = 1; i <= 60; i += 1) {
    const nom = NOMS[i % NOMS.length];
    const cognoms = COGNOMS[i % COGNOMS.length];
    d[`socis/s${i}`] = {
      numeroSoci: 1000 + i,
      nom,
      cognoms,
      dni: `${String(10000000 + i * 7919).slice(0, 8)}Z`,
      telefon: '+34 600 000 000 / +34 977 000 000 (només tardes)',
      correuElectronic: i === 1 ? CORREU_LLARG : `soci${i}.${nom.split(' ')[0].toLowerCase()}@exemple.cat`,
      poblacio: 'Roda de Berà (Urbanització Costa Daurada, sector de Ponent)',
      codiPostal: '43883',
      organitzacio: i % 5 === 0 ? 'Associació Cultural i Recreativa de Veïns i Veïnes de la Platja Llarga' : '',
      dataAlta: iso(400 + i),
      ultimPagament: iso((i * 13) % 420),
      inicPeriode: i % 3 === 0 ? iso((i * 13) % 420) : '',
      tokenCarnet: `tok${i}abcdefghijklmnopqrstuvwxyz0123456789`,
      actiu: i % 11 !== 0,
      motiuDesactivacio: i % 11 === 0 ? `Baixa voluntària: ${PARAULA_LLARGA}` : '',
      estatManual: i % 17 === 0 ? 'pendent' : null,
    };
  }

  // --- Sessions (12).
  for (let i = 1; i <= 12; i += 1) {
    const titol = TITOLS[i % TITOLS.length];
    d[`sessions/ses${i}`] = {
      titol,
      data: iso(i * 14 - 20),
      hora: '19:00',
      ...(i === 2 ? { propostaId: 'p2' } : {}),
      activa: i === 2,
      senseControl: i === 5,
      urlProgramacio: URL_LLARGA,
      imatgeUrl: i % 2 === 0 ? CARTELL_AMPLE : '',
      slug: `sessio-${i}-${'molt-llarga-'.repeat(4)}final`,
      publicar: i % 3 !== 0,
      publica: {
        titol,
        titolOriginal: `${titol} (títol original)`,
        directors: ['Jean-Pierre Jeunet-Marc Caro i Associats', 'Agnès Varda'],
        interprets: ['Catherine Deneuve', 'Nino Castelnuovo', 'Marc Michel', 'Ellen Farner', 'Anne Vernon', 'Mireille Perrey'],
        generes: ['Drama', 'Musical', 'Romàntica'],
        participa: ['Associació Cultural i Recreativa de Veïns i Veïnes de la Platja Llarga'],
        collabora: ['Ajuntament de Roda de Berà'],
        aliases: [],
        descripcio: `Una història d'amor i pèrdua a la Normandia dels anys seixanta. ${PARAULA_LLARGA}`,
        sinopsi: `Sinopsi llarguíssima. ${'Paraules i més paraules per omplir el paràgraf. '.repeat(12)}${URL_LLARGA}`,
        trailer: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        guio: 'Jacques Demy, Agnès Varda i un equip de guionistes amb noms llarguíssims',
        pais: 'França, Alemanya Occidental, Itàlia, Bèlgica, Luxemburg',
        idioma: 'Francès, alemany, italià, català (subtítols)',
        any: 1964,
        durada: 91,
        cartell: i % 2 === 0 ? CARTELL_AMPLE : '',
        suportDistribucio: 'Distribuïdora 3',
        // ses3 referencia d1 per id amb un nom vell: el selector ha de mostrar el nom llarg actual del catàleg.
        ...(i === 3 && { suportDistribucio: 'Nom antic de la distribuïdora', suportDistribucioId: 'd1' }),
        // ses2 (activa) estressa les pestanyes Continguts i Mitjans: galeria, cos llarg i títol llarguíssim.
        ...(i === 2 && {
          titol: `${titol} ${PARAULA_LLARGA} ${PARAULA_LLARGA}`,
          // Selectors d'entitats: organitzador antic fora del catàleg i un nom llarg antic + un del catàleg.
          organitza: 'cineclub',
          // Suport de distribució antic (llarg) que no és al catàleg de distribuïdores.
          suportDistribucio: 'Distribuïdora Antiga de Cinema d\'Autor i Clàssics Restaurats de la Mediterrània Occidental',
          participa: [
            'Associació Cultural i Recreativa de Veïns i Veïnes de la Platja Llarga',
            'Associació Cultural i Recreativa de Veïns i Amics del Cinema Independent de la Costa Daurada i el Camp de Tarragona',
          ],
          galeria: [CARTELL_AMPLE, '/logo-cineclub.png', '/logo-marca.png', '/cinema-pattern.jpg', '/logo-footer.png'],
          cos: `## Sinopsi\n\n${'Paràgraf llarg amb molt de text per omplir l\'àrea. '.repeat(30)}\n\n## Context\n\n${URL_LLARGA}\n\n${PARAULA_LLARGA}\n\n`.repeat(3),
        }),
      },
    };
  }

  // --- Registre d'accessos: entrades de socis i genèriques a les sessions.
  let n = 0;
  for (let s = 1; s <= 12; s += 1) {
    for (let k = 1; k <= 25; k += 1) {
      n += 1;
      d[`accessLog/a${n}`] = {
        tipus: k % 4 === 0 ? 'generic' : 'soci',
        numeroSoci: 1000 + ((k * s) % 60) + 1,
        codiTiquet: k % 4 === 0 ? `T-${String(100 + n).padStart(6, '0')}` : null,
        preuAplicat: k % 4 === 0 ? 5 : null,
        sessionId: `ses${s}`,
        timestamp: ts(s * 14 - 20, 18, (k * 3) % 60),
        escanejatPer: 'arnes-admin',
      };
    }
  }

  // --- Moviments (80) amb conceptes i imports extrems.
  const categories = [['ingres', 'Quotes socis', 'efectiu'], ['ingres', 'Aportacions', 'datafon'], ['despesa', 'Gestió pel·lícules', 'banc'], ['despesa', 'Gestió associació', 'efectiu']];
  for (let i = 1; i <= 80; i += 1) {
    const [tipus, categoria, metodePagament] = categories[i % categories.length];
    const traspas = i % 9 === 0;
    d[`moviments/m${i}`] = {
      tipus: traspas ? 'traspas' : tipus,
      categoria: traspas ? null : categoria,
      direccio: traspas ? 'caixa-a-banc' : null,
      metodePagament: traspas ? null : metodePagament,
      concepte: i === 1
        ? `Pagament dels drets de projecció pública de «${TITOLS[0]}» a ${CORREU_LLARG}`
        : `${categoria} — ${TITOLS[i % TITOLS.length]}`,
      preuUnitari: 12345.67,
      quantitat: 1,
      total: i === 1 ? 1234567.89 : 25 * i + 0.5,
      data: iso(i * 3),
      sessionId: `ses${(i % 12) + 1}`,
      numeroSoci: categoria === 'Quotes socis' ? 1000 + ((i % 60) + 1) : null,
      tipusQuota: categoria === 'Quotes socis' ? (i % 2 ? 'alta' : 'renovacio') : null,
      adjunt: i % 7 === 0 ? { path: `factures/x/${PARAULA_LLARGA}.pdf`, nom: `${PARAULA_LLARGA}.pdf` } : null,
    };
  }

  // --- Lots de tiquets.
  d['lotsTiquets/lot1'] = {
    numeroInicial: 100, quantitat: 40, preu: 5, dataGeneracio: iso(60), impres: true, dataImpressio: iso(59),
    anulat: false, dataAnulacio: null, codisAnulats: ['T-000105'],
  };
  d['lotsTiquets/lot2'] = {
    numeroInicial: 140, quantitat: 500, preu: 3.5, dataGeneracio: iso(10), impres: false, dataImpressio: null,
    anulat: false, dataAnulacio: null, codisAnulats: [],
  };
  d['lotsTiquets/lot3'] = {
    numeroInicial: 999990, quantitat: 20, preu: 5, dataGeneracio: iso(5), impres: false, dataImpressio: null,
    anulat: true, dataAnulacio: iso(4), codisAnulats: [],
  };
  d['configuracio/tiquets'] = { seguentNumero: 1000010 };
  d['configuracio/associacio'] = { quotaAnual: 25 };

  // --- Incidències d'escaneig.
  const motius = ['codi-desconegut', 'soci-no-trobat', 'tiquet-ja-utilitzat', 'timeout-escriptura', 'excepcio'];
  for (let i = 1; i <= 30; i += 1) {
    d[`escaneigErrors/e${i}`] = {
      motiu: motius[i % motius.length],
      codi: i === 1 ? `CARNET-${'x'.repeat(80)}` : `SOCI-${1000 + i}`,
      metode: i % 2 ? 'qr' : 'manual',
      sessionId: `ses${(i % 12) + 1}`,
      detall: i % 3 === 0 ? `FirebaseError: [code=unavailable]: ${URL_LLARGA}` : '',
      online: i % 2 === 0,
      ms: 8123,
      desdeCache: i % 4 === 0,
      resultatAnterior: 'ok',
      versio: 'v2026.10.22-arnes',
      timestamp: ts(i, 18, i),
    };
  }

  // --- Sol·licituds.
  for (let i = 1; i <= 8; i += 1) {
    d[`solicituds/sol${i}`] = {
      estat: i % 4 === 0 ? 'descartada' : 'pendent',
      nom: NOMS[i % NOMS.length],
      cognoms: COGNOMS[i % COGNOMS.length],
      dni: '12345678Z',
      telefon: '+34 600 000 000',
      correuElectronic: i === 1 ? CORREU_LLARG : `sollicitant${i}@exemple.cat`,
      poblacio: 'Roda de Berà (Urbanització Costa Daurada, sector de Ponent)',
      codiPostal: '43883',
      comentaris: i === 1 ? `M'agradaria fer-me sòcia. ${URL_LLARGA}` : 'Cap comentari.',
      timestamp: ts(i),
    };
  }

  // --- Distribuïdores.
  d['distribuidores/d1'] = {
    nom: 'Distribuïdora de Cinema Independent i Clàssic del Mediterrani, Societat Limitada',
    web: URL_LLARGA,
    urlPublica: URL_LLARGA,
    logo: '/logo-cineclub.png',
    contacte: 'Maria Montserrat Immaculada Puigdollers-Vallverdú i Casademunt de la Torre',
    correu: CORREU_LLARG,
    preu: 350,
    condicions: `Mínim garantit de 150€ o el 35% de la taquilla, el que sigui més alt. ${PARAULA_LLARGA}`,
  };
  for (let i = 2; i <= 6; i += 1) {
    d[`distribuidores/d${i}`] = { nom: `Distribuïdora ${i}`, web: `distribuidora${i}.example`, contacte: 'Joan', correu: `joan${i}@example.com`, preu: i * 50, condicions: '' };
  }
  // Una amb logo ample (no quadrat) i pàgina pública curta; la resta sense logo.
  d['distribuidores/d2'].logo = CARTELL_AMPLE;
  d['distribuidores/d2'].urlPublica = 'https://distribuidora2.example/';

  // --- Entitats (una amb nom molt llarg i sense logo).
  d['entitats/e1'] = {
    nom: 'Associació Cultural i Recreativa de Veïns i Amics del Cinema Independent de la Costa Daurada i el Camp de Tarragona',
    url: URL_LLARGA,
  };
  d['entitats/e2'] = { nom: 'Ateneu Rodenc', url: 'https://ateneu.example/', logo: '/logo-cineclub.png' };
  d['entitats/e3'] = { nom: 'Ajuntament de Roda de Berà', url: 'https://rodadebera.example/', logo: '/logo-cineclub.png' };

  // --- Propostes (20) i dades internes.
  // Barreja d'estats amb 14 propostes efectives (aprovades o programades), perquè la votació tingui un top llarg.
  const estatDe = (i) => {
    if (i % 5 === 0) return 'pendent';
    if (i % 7 === 0) return 'rebutjada';
    return i % 2 ? 'aprovada' : 'programada';
  };
  for (let i = 1; i <= 20; i += 1) {
    const titol = TITOLS[i % TITOLS.length];
    d[`propostes/p${i}`] = {
      titol,
      titolLocal: `${titol} (títol a Espanya)`,
      lema: 'Una pel·lícula que no et deixarà indiferent, ni a tu ni a ningú de la sala',
      estat: estatDe(i),
      numeroSoci: 1000 + i,
      nomProposant: `${NOMS[i % NOMS.length]} ${COGNOMS[i % COGNOMS.length]}`,
      comentari: i === 1 ? `L'he vist tres cops i cada cop m'agrada més. ${URL_LLARGA}` : 'Molt recomanable.',
      // Cartell vertical (el normal) a p3; amples a la resta de senars; sense cartell a les parells.
      imatgeUrl: (i === 3 && CARTELL_VERTICAL) || (i % 2 ? CARTELL_AMPLE : ''),
      trailerUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      enllac: URL_LLARGA,
      sinopsi: `${'Una sinopsi llarga, molt llarga, que no s\'acaba mai. '.repeat(10)}${PARAULA_LLARGA}`,
      sinopsiIdioma: i % 3 === 0 ? 'es' : 'ca',
      tmdbId: i % 2 ? 1000 + i : null,
      tmdbUrl: `https://www.themoviedb.org/movie/${1000 + i}`,
      directors: ['Jean-Pierre Jeunet-Marc Caro i Associats', 'Agnès Varda'],
      guionistes: ['Jacques Demy', 'Un guionista amb un nom extraordinàriament llarg'],
      paisos: ['França', 'Alemanya Occidental', 'Itàlia'],
      any: 1964,
      durada: 91,
      idiomes: ['Francès', 'Alemany'],
      generes: ['Drama', 'Musical'],
      repartiment: [
        { nom: 'Catherine Deneuve', personatge: 'Geneviève Emery' },
        { nom: 'Nino Castelnuovo', personatge: 'Guy Foucher' },
        { nom: PARAULA_LLARGA, personatge: PARAULA_LLARGA },
      ],
      valoracio: 7.8,
      timestamp: ts(i * 2),
    };
    d[`propostesInternes/p${i}`] = {
      preu: i % 3 === 0 ? null : 1234.56 * i,
      condicions: i === 1 ? `Condicions especials: ${PARAULA_LLARGA} ${URL_LLARGA}` : '',
      distribuidoraId: `d${(i % 6) + 1}`,
    };
  }

  // Fora de cap tanda: una sense `timestamp` i una amb una distribuïdora de nom llarguíssim.
  d['propostes/p21'] = { titol: 'Proposta sense data', estat: 'pendent', numeroSoci: 1021, nomProposant: 'Laia Llorens' };
  d['propostes/p22'] = {
    titol: `${TITOLS[4]} (còpia nova)`, estat: 'aprovada', numeroSoci: 1022, nomProposant: `${NOMS[0]} ${COGNOMS[0]}`, timestamp: ts(1),
  };
  d['distribuidores/d7'] = {
    nom: `Distribuïdora Internacional de Cinema d'Autor, Restauracions i Drets Audiovisuals del Mediterrani Occidental ${PARAULA_LLARGA}`,
    preu: 99,
    condicions: '',
  };
  d['propostesInternes/p22'] = { preu: null, condicions: null, distribuidoraId: 'd7' };
  // Fitxa de proposta: una de TMDB amb camps editats a mà, en dues tandes i amb sessió (p23), i una feta a mà
  // sense pel·lícula de TMDB, aprovada i sense sessió («Programar sessió» i l'avís del Resum) (p24).
  d['propostes/p23'] = {
    ...d['propostes/p1'],
    titol: `${TITOLS[2]}: edició restaurada amb un subtítol llarguíssim que ocupa més de dues línies a la capçalera`,
    estat: 'programada',
    numeroSoci: 1003,
    tmdbId: 1023,
    tmdbUrl: 'https://www.themoviedb.org/movie/1023',
    directors: ['Jacques Demy', 'Directora afegida a mà'],
    campsEditats: ['directors'],
    imatgeUrl: CARTELL_VERTICAL,
    timestamp: ts(3),
  };
  d['propostesInternes/p23'] = { preu: 250, condicions: 'Còpia DCP: cal retornar-la abans de 15 dies.', distribuidoraId: 'd2' };
  d['propostes/p24'] = {
    titol: 'Proposta feta a mà sense TMDB',
    estat: 'aprovada',
    numeroSoci: 1004,
    nomProposant: `${NOMS[4 % NOMS.length]} ${COGNOMS[4 % COGNOMS.length]}`,
    comentari: `La vam veure al festival. ${URL_LLARGA}`,
    timestamp: ts(2),
  };
  // Sessions vinculades a propostes (a més de ses2 → p2).
  d['sessions/ses4'].propostaId = 'p4';
  d['sessions/ses6'].propostaId = 'p12';
  d['sessions/ses8'].propostaId = 'p23';

  // --- Tandes de votació.
  const idsPropostes = Array.from({ length: 20 }, (_, i) => `p${i + 1}`);
  d['tandes/t1'] = {
    nom: 'Tanda de tardor 2026: cicle de cinema europeu restaurat i clàssics oblidats',
    propostes: idsPropostes,
    tanca: ts(-10),
    creada: ts(5),
  };
  d['tandes/t2'] = { nom: 'Tanda de primavera', propostes: [...idsPropostes.slice(0, 4), 'p23'], tanca: ts(100), creada: ts(130) };
  d['tandes/t1'].propostes = [...idsPropostes, 'p23'];
  // Tandes tancades amb 8 i 12 propostes efectives, per comprovar l'amplada de la taula de resultats.
  const efectives = idsPropostes.filter((_, k) => ![5, 7, 10, 14, 15, 20].includes(k + 1));
  d['tandes/t3'] = { nom: 'Tanda de 8 pel·lícules', propostes: efectives.slice(0, 8), tanca: ts(200), creada: ts(230) };
  d['tandes/t4'] = { nom: 'Tanda de 12 pel·lícules', propostes: efectives.slice(0, 12), tanca: ts(300), creada: ts(330) };
  for (let i = 1; i <= 30; i += 1) {
    const valors = Object.fromEntries(idsPropostes.filter((_, k) => (k + i) % 3 !== 0).map((id, k) => [id, (i + k * k) % (k % 5 + 2) ? 'like' : 'dislike']));
    d[`tandes/t1/vots/${1000 + i}`] = { valors };
  }

  return d;
}
