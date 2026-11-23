import { toBlob } from 'html-to-image';
import { dataValida, generarSlug } from './sessioPublica';

export const LLOC = 'Teatre del Casino Municipal de Roda de Berà';
export const MAX_PROGRAMACIO = 10;
export const FOTOGRAMES_TANCAMENT = 4;
const MAX_EXTRES = 12;
export const FOTOGRAMES_FONS = 5;
export const MAX_CURIOSITAT = 280;
export const AVIS_CURIOSITAT = `Una curiositat passa de ${MAX_CURIOSITAT} caràcters: pot no cabre a la diapositiva.`;

// Les curiositats que es desen: sense espais sobrants ni línies buides.
export const curiositatsADesar = (llista) => llista.map((c) => c.trim()).filter(Boolean);
export const AMPLADA = 1080;
export const ALCADA = 1350;

const DIES = ['Diumenge', 'Dilluns', 'Dimarts', 'Dimecres', 'Dijous', 'Divendres', 'Dissabte'];
const MESOS = ['gener', 'febrer', 'març', 'abril', 'maig', 'juny', 'juliol', 'agost', 'setembre', 'octubre', 'novembre', 'desembre'];

const llista = (v) => (Array.isArray(v) ? v : []);

// Portada, una diapositiva per curiositat (amb un fotograma de la galeria, repetit en cicle) i tancament.
export function diapositivesPelicula(sessio) {
  const curiositats = llista(sessio?.publica?.curiositats);
  const galeria = llista(sessio?.publica?.galeria);
  return [
    { tipus: 'portada-pelicula' },
    ...curiositats.map((text, i) => ({ tipus: 'curiositat', text, imatge: galeria.length ? galeria[i % galeria.length] : null })),
    { tipus: 'tancament' },
  ];
}

const escapa = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Escapa l'HTML i només admet la negreta `**text**`.
export const negretaAHtml = (text) => escapa(String(text ?? '')).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

// "Dijous 22 d'octubre" (com la web): "d'" davant de vocal, "de " en la resta.
export function diaMesCa(data) {
  if (!dataValida(data)) return ''; // una sessió recent programada encara no té data, o la té malmesa (mes 13, 31 de febrer...)
  const [any, mes, dia] = data.slice(0, 10).split('-').map(Number);
  const nomMes = MESOS[mes - 1];
  const article = 'aeiou'.includes(nomMes[0]) ? "d'" : 'de ';
  return `${DIES[new Date(Date.UTC(any, mes - 1, dia)).getUTCDay()]} ${dia} ${article}${nomMes}`;
}

export const fraseVersio = (sessio) => (['vose', 'vosc'].includes(sessio?.publica?.versioTipus) ? 'en V.O. subtitulada' : '');

// Baixa la imatge i la torna com a `data:`; sense CORS al bucket el navegador la bloqueja i això llança.
export async function imatgeAData(url) {
  // `reload`: no aprofita una còpia de la caché HTTP baixada per un <img> sense CORS.
  const resposta = await fetch(url, { cache: 'reload' });
  if (!resposta.ok) throw new Error(`No s'ha pogut baixar la imatge (${resposta.status})`);
  const blob = await resposta.blob();
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(lector.result);
    lector.onerror = () => reject(new Error('No s\'ha pogut llegir la imatge'));
    lector.readAsDataURL(blob);
  });
}

// El node és la diapositiva a mida real (la vista prèvia només l'escala el contenidor, no el node).
export async function exportaPng(node) {
  const blob = await toBlob(node, {
    width: AMPLADA, height: ALCADA, pixelRatio: 1, cacheBust: false, style: { transform: 'none' },
  });
  if (!blob) throw new Error('No s\'ha pogut generar la imatge');
  return blob;
}

export const nomFitxer = ({ sessio, tipus, n }) => `cineclub-${sessio.data}-${generarSlug(sessio.slug || sessio.titol || '')}-${tipus}-${n + 1}.png`;

export function descarrega(blob, nom) {
  const url = URL.createObjectURL(blob);
  const enllac = document.createElement('a');
  enllac.href = url;
  enllac.download = nom;
  enllac.click();
  // Revocar-lo al moment pot cancel·lar la baixada a Firefox i Safari: es fa una mica després.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const NOMS_CINECLUB = ['cineclub', 'cineclub roda de berà'];

// Logos (URL) de les entitats que organitzen o col·laboren, sense el del Cineclub (el peu el du sempre).
export function logosEntitats(sessio, entitats) {
  const p = sessio?.publica ?? {};
  const noms = [p.organitza, ...llista(p.participa), ...llista(p.collabora)]
    .filter((nom) => typeof nom === 'string' && nom.trim() && !NOMS_CINECLUB.includes(nom.trim().toLowerCase()));
  const logos = noms.map((nom) => entitats.find((e) => e.nom === nom)?.logo).filter(Boolean);
  return [...new Set(logos)];
}

// Les URL d'imatge d'una diapositiva (cartell, fotograma, fotogrames del tancament i logos): s'han de passar a `data:` per exportar-les.
export function urlsDiapositiva(sessio, diapositiva, logos) {
  let collage = [];
  if (diapositiva?.tipus === 'tancament') collage = llista(sessio?.publica?.galeria).slice(0, FOTOGRAMES_TANCAMENT);
  if (diapositiva?.tipus === 'tancament-programacio') collage = llista(diapositiva.imatges);
  if (diapositiva?.tipus === 'portada-pelicula') collage = llista(sessio?.publica?.galeria).slice(0, FOTOGRAMES_FONS);
  if (diapositiva?.tipus === 'obertura-programacio') collage = [...llista(diapositiva.imatges), ...llista(diapositiva.extres)];
  return [...new Set([sessio?.publica?.cartell, diapositiva?.imatge, ...collage, ...logos].filter(Boolean))];
}

const esVersioOriginal = (s) => ['vo', 'vose', 'vosc'].includes(s?.publica?.versioTipus);

// Última diapositiva d'una publicació de Programació: collage amb la primera imatge de cada sessió (galeria o, si no, cartell).
const imatgesTancament = (sessions) => sessions
  .map((s) => llista(s.publica?.galeria)[0] || s.publica?.cartell).filter(Boolean).slice(0, FOTOGRAMES_TANCAMENT);

export function diapositivaTancamentProgramacio(sessions) {
  return { tipus: 'tancament-programacio', imatges: imatgesTancament(sessions), versio: sessions.length > 0 && sessions.every(esVersioOriginal) };
}

// La distribuïdora de la sessió: per id i, a les sessions antigues, pel nom exacte.
const trobaDistribuidora = (sessio, distribuidores) => {
  const p = sessio?.publica ?? {};
  return (p.suportDistribucioId && distribuidores.find((d) => d.id === p.suportDistribucioId))
    || (p.suportDistribucio && distribuidores.find((d) => d.nom === p.suportDistribucio))
    || null;
};

// Logo de la distribuïdora de la sessió, o null.
export const logoDistribuidora = (sessio, distribuidores) => trobaDistribuidora(sessio, distribuidores)?.logo || null;

const esNomFilmoxarxa = (nom) => typeof nom === 'string' && nom.trim().toLowerCase() === 'filmoxarxa';

// La distribuïdora de la sessió és Filmoxarxa: el seu logo va al costat del del Cineclub a les diapositives de curiositats i de tancament.
export const esFilmoxarxa = (sessio, distribuidores) => esNomFilmoxarxa(trobaDistribuidora(sessio, distribuidores)?.nom ?? sessio?.publica?.suportDistribucio);

// Text pla d'un HTML renderitzat (Instagram no entén Markdown): un bloc per paràgraf o títol, i «• » a les llistes.
export function htmlAText(html) {
  const doc = new DOMParser().parseFromString(html ?? '', 'text/html');
  const blocs = [];
  for (const node of doc.body.children) {
    if (node.tagName === 'UL' || node.tagName === 'OL') {
      blocs.push([...node.children].map((li, i) => `${node.tagName === 'OL' ? `${i + 1}.` : '•'} ${li.textContent.trim()}`).join('\n'));
    } else if (node.textContent.trim()) {
      blocs.push(node.textContent.trim());
    }
  }
  return blocs.join('\n\n');
}

// Tipus de sessió (secció) amb el nom i els colors de la web: és la pastilla de les portades. Sense secció, Cartellera (la per defecte).
const SECCIONS_SOCIAL = {
  cartellera: { nom: 'Cartellera', color: '#bf9000', text: '#000000' },
  xarxa: { nom: 'Xarxa', color: '#2f6f76', text: '#ffffff' },
  extra: { nom: 'Extra', color: '#8b2e2e', text: '#ffffff' },
  xiquets: { nom: 'Xiquis', color: '#a78bd4', text: '#000000' },
};
export const seccioDe = (sessio) => SECCIONS_SOCIAL[sessio?.publica?.seccio] ?? SECCIONS_SOCIAL.cartellera;

// Les curiositats de la sessió: el seu camp propi (que la fitxa de la sessió no reescriu) i, si no n'hi ha, el de la fitxa pública
// (on es van desar al principi).
export const curiositatsDe = (sessio) => {
  if (Array.isArray(sessio?.curiositatsSocial)) return sessio.curiositatsSocial;
  return llista(sessio?.publica?.curiositats);
};

// Una curiositat per imatge de la galeria, com a màxim.
export const maxCuriositats = (sessio) => llista(sessio?.publica?.galeria).length;

// Caixa (x, y, w, h) que conté tot el que no és transparent ni quasi blanc, o null si no hi ha res. `imatge` és un ImageData.
export function caixaContingut({ data, width, height }) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const buit = data[i + 3] < 16 || (data[i] > 245 && data[i + 1] > 245 && data[i + 2] > 245);
      if (!buit) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

// Treu els marges buits d'un logo (`data:`), perquè ompli la seva caixa. Si no es pot (sense canvas), el torna tal qual.
export async function retallaMarges(dataUrl) {
  try {
    const imatge = new Image();
    imatge.src = dataUrl;
    await imatge.decode();
    const origen = document.createElement('canvas');
    origen.width = imatge.naturalWidth;
    origen.height = imatge.naturalHeight;
    const ctx = origen.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.drawImage(imatge, 0, 0);
    const caixa = caixaContingut(ctx.getImageData(0, 0, origen.width, origen.height));
    if (!caixa || (caixa.w === origen.width && caixa.h === origen.height)) return dataUrl;
    const retallat = document.createElement('canvas');
    retallat.width = caixa.w;
    retallat.height = caixa.h;
    retallat.getContext('2d').drawImage(origen, caixa.x, caixa.y, caixa.w, caixa.h, 0, 0, caixa.w, caixa.h);
    return retallat.toDataURL('image/png');
  } catch {
    return dataUrl;
  }
}

const part = (data) => {
  const [any, mes, dia] = data.slice(0, 10).split('-').map(Number);
  return { any, mes, dia };
};
const deMes = (mes) => `${'aeiou'.includes(MESOS[mes - 1][0]) ? "d'" : 'de '}${MESOS[mes - 1]}`;

// «el 3 de desembre», «del 3 al 17 de desembre» o «del 29 de setembre al 6 d'octubre».
export function rangDatesCa(dates) {
  const ordenades = dates.filter(dataValida).sort();
  if (ordenades.length === 0) return '';
  const a = part(ordenades[0]);
  const b = part(ordenades[ordenades.length - 1]);
  if (a.any === b.any && a.mes === b.mes && a.dia === b.dia) return `el ${a.dia} ${deMes(a.mes)}`;
  if (a.any === b.any && a.mes === b.mes) return `del ${a.dia} al ${b.dia} ${deMes(b.mes)}`;
  return `del ${a.dia} ${deMes(a.mes)} al ${b.dia} ${deMes(b.mes)}`;
}

const entreFiles = (n, nFiles) => Array.from({ length: nFiles }, (_, i) => Math.floor(n / nFiles) + (i < n % nFiles ? 1 : 0));

// Mosaic d'imatges per files equilibrades (7 → 3,2,2; mai una imatge sola a l'última fila si es pot evitar): de totes les files possibles
// tria les que fan les imatges més grans dins de l'espai. `aspecte` és ample / alt de cada imatge: 2/3 per als cartells (verticals) i
// 3/2 per als fotogrames (apaïsats). Dona la mida de cada imatge i les imatges de cada fila.
export function disposicioMosaic(n, {
  amplada = 984, alcada = 1190, buit = 16, aspecte = 2 / 3,
} = {}) {
  if (n <= 0) return { cols: 0, files: [], w: 0, h: 0 };
  const candidats = [];
  for (let nFiles = 1; nFiles <= n; nFiles += 1) {
    const files = entreFiles(n, nFiles);
    const cols = files[0];
    const w = Math.min((amplada - (cols - 1) * buit) / cols, ((alcada - (nFiles - 1) * buit) / nFiles) * aspecte);
    candidats.push({ cols, files, w, h: w / aspecte });
  }
  const senseSola = candidats.filter((c) => n <= 3 || Math.min(...c.files) > 1);
  return (senseSola.length ? senseSola : candidats).reduce((millor, c) => (c.w > millor.w + 0.5 ? c : millor));
}

// Reparteix les imatges en files de les mides indicades.
export function repartiment(imatges, files) {
  let inici = 0;
  return files.map((quantes) => {
    const fila = imatges.slice(inici, inici + quantes);
    inici += quantes;
    return fila;
  });
}

// Tires de pel·lícula de l'obertura: cada tira porta fins a 3 fotogrames connectats (les de 2, més grans) i travessa la imatge de
// costat a costat, tallada per les vores. El marc d'una tira (perforacions de dalt i de baix) afegeix aquesta alçada.
const MARC_ALT_TIRA = 56;
const FACTOR_TIRA = { 1: 1.9, 2: 1.4, 3: 1 };
const ASPECTE_FOTOGRAMA = 3 / 2;

// Quantes tires i de quina mida: tires equilibrades (4 → 2,2; 7 → 3,2,2), mai d'un de sol si n'hi ha més d'un. Dona, per tira,
// els fotogrames principals (`k`), la mida de cada fotograma (`w`, `h`) i quants fotogrames laterals calen a cada costat.
export function disposicioTires(n, {
  amplada = 1080, alcada = 850, buit = 8, entreTires = 18, vora = 60,
} = {}) {
  if (n <= 0) return { tires: [] };
  const nTires = Math.ceil(n / 3);
  const files = entreFiles(n, nTires);
  const sumaFactors = files.reduce((a, k) => a + FACTOR_TIRA[k] / ASPECTE_FOTOGRAMA, 0);
  const perAlcada = (alcada - nTires * MARC_ALT_TIRA - (nTires - 1) * entreTires) / sumaFactors;
  const perAmplada = Math.min(...files.map((k) => (amplada - 2 * vora - (k - 1) * buit) / (k * FACTOR_TIRA[k])));
  const base = Math.max(0, Math.min(perAlcada, perAmplada));
  return {
    tires: files.map((k) => {
      const w = FACTOR_TIRA[k] * base;
      const costat = (amplada - (k * w + (k - 1) * buit)) / 2;
      return {
        k, w, h: w / ASPECTE_FOTOGRAMA, laterals: Math.ceil(costat / (w + buit)) + 1,
      };
    }),
  };
}

const comparaClau = (a, b) => a.reduce((r, v, i) => r || v - b[i], 0);

// Compon les tires: els fotogrames principals al mig i, als costats (que es tallen), fotogrames extres; sense extres, es fan servir
// els principals. Els costats es reparteixen perquè no es repeteixi la mateixa imatge enlloc que es vegi massa: la tira de dalt i la de
// baix no tallen la mateixa imatge pel mateix costat i posició, una tira no repeteix a la dreta el que porta a l'esquerra, ni hi ha
// la mateixa imatge en dos fotogrames seguits d'un costat. Si hi ha poques imatges per repetir, tria les que menys xoquen (amb dues,
// les alterna invertides) i després les menys usades.
export function composaTires(imatges, extres, opcions) {
  const { tires } = disposicioTires(imatges.length, opcions);
  if (tires.length === 0) return [];
  const pool = extres.length > 0 ? extres : imatges;
  const principals = repartiment(imatges, tires.map((t) => t.k));
  const usos = new Map(pool.map((url) => [url, 0]));
  // Posicions comptades des de la vora (0 = el fotograma que es talla del tot)
  const costats = { esq: tires.map(() => []), dre: tires.map(() => []) };
  const tria = (i, costat, j) => {
    const propi = costats[costat][i];
    const oposat = costats[costat === 'esq' ? 'dre' : 'esq'][i];
    const veina = i > 0 ? costats[costat][i - 1] : [];
    let millor = null;
    pool.forEach((url, ordre) => {
      const pena = (veina[j] === url ? 3 : 0) + (oposat[j] === url ? 3 : 0) + (propi[j - 1] === url ? 2 : 0) + (principals[i].includes(url) ? 1 : 0);
      const clau = [pena, usos.get(url), ordre];
      if (!millor || comparaClau(clau, millor.clau) < 0) millor = { url, clau };
    });
    usos.set(millor.url, usos.get(millor.url) + 1);
    return millor.url;
  };
  const maxLaterals = Math.max(...tires.map((t) => t.laterals));
  for (let j = 0; j < maxLaterals; j += 1) {
    tires.forEach((t, i) => {
      if (j < t.laterals) {
        costats.esq[i][j] = tria(i, 'esq', j);
        costats.dre[i][j] = tria(i, 'dre', j);
      }
    });
  }
  return tires.map((t, i) => ({
    ...t, principals: principals[i], esquerra: costats.esq[i], dreta: [...costats.dre[i]].reverse(),
  }));
}

// Fons de la portada d'una pel·lícula: dues tires de pel·lícula (com les de l'obertura de Programació) que travessen la imatge de
// costat a costat. El cartell en tapa el mig, així que només es veuen els fotogrames dels costats (`vistos`, 2 per tira): aquests es
// reparteixen entre totes les imatges perquè siguin tots diferents (només es repeteix si n'hi ha menys que fotogrames visibles).
// La resta (tapats) s'omple amb cura: cap igual al del costat ni al de sobre. `tapat` és la fracció d'ample que cobreix el cartell.
export function composaFonsTires(pool, {
  amplada = 1080, nTires = 2, alturaFotograma = 230, buit = 8, tapat = 0.58,
} = {}) {
  if (pool.length === 0) return [];
  const h = alturaFotograma;
  const w = h * ASPECTE_FOTOGRAMA;
  const perTira = Math.ceil(amplada / (w + buit)) + 1;
  const desplacament = (perTira * w + (perTira - 1) * buit - amplada) / 2;
  const tapatDe = (amplada * (1 - tapat)) / 2;
  const tapatFins = amplada - tapatDe;
  // Un fotograma es veu si en queda més de 40 px dins la imatge i fora de la zona del cartell
  const vistos = Array.from({ length: perTira }, (_, j) => j).filter((j) => {
    const inici = j * (w + buit) - desplacament;
    const fi = inici + w;
    const esquerra = Math.max(0, Math.min(fi, tapatDe) - Math.max(inici, 0));
    const dreta = Math.max(0, Math.min(fi, amplada) - Math.max(inici, tapatFins));
    return esquerra + dreta > 40;
  });
  const graella = Array.from({ length: nTires }, () => Array(perTira).fill(null));
  const usos = new Map(pool.map((url) => [url, 0]));
  const posa = (t, j, url) => {
    graella[t][j] = url;
    usos.set(url, usos.get(url) + 1);
  };
  // 1) els visibles: les imatges menys usades, perquè siguin tots diferents
  // (a igualtat d'usos, no la mateixa imatge sobre la de la tira de dalt ni com l'altre costat de la mateixa tira: amb dues imatges, les
  // tires s'inverteixen)
  for (let t = 0; t < nTires; t += 1) {
    vistos.forEach((j, indexVist) => {
      const altreCostat = indexVist > 0 ? graella[t][vistos[0]] : null;
      let millor = null;
      pool.forEach((url, ordre) => {
        const pena = (graella[t - 1]?.[j] === url ? 3 : 0) + (altreCostat === url ? 2 : 0);
        const clau = [usos.get(url), pena, ordre];
        if (!millor || comparaClau(clau, millor.clau) < 0) millor = { url, clau };
      });
      posa(t, j, millor.url);
    });
  }
  // 2) la resta (tapats): cap igual al del costat ni al de sobre
  for (let t = 0; t < nTires; t += 1) {
    for (let j = 0; j < perTira; j += 1) {
      if (graella[t][j] === null) {
        let millor = null;
        pool.forEach((url, ordre) => {
          const pena = (graella[t - 1]?.[j] === url ? 3 : 0) + (graella[t][j - 1] === url ? 3 : 0) + (graella[t][j + 1] === url ? 3 : 0)
            + (graella[t - 1]?.[j - 1] === url ? 1 : 0) + (graella[t - 1]?.[j + 1] === url ? 1 : 0);
          const clau = [pena, usos.get(url), ordre];
          if (!millor || comparaClau(clau, millor.clau) < 0) millor = { url, clau };
        });
        posa(t, j, millor.url);
      }
    }
  }
  return graella.map((fotogrames) => ({
    w, h, fotogrames, vistos,
  }));
}

// Primera diapositiva d'una publicació de Programació: tires de pel·lícula amb un fotograma de cada sessió i el rang de dates. Mai
// en repeteix cap del collage del tancament (cada sessió hi aporta el primer lliure; si no n'hi ha cap, no hi entra). Els `extres`
// (altres fotogrames de les mateixes pel·lícules, ni principals ni del tancament) omplen els costats de les tires. Si cap sessió
// té un fotograma lliure, es fa un mosaic amb els cartells.
export function diapositivaObertura(sessions) {
  const delTancament = new Set(imatgesTancament(sessions));
  const fotogrames = sessions.map((s) => llista(s.publica?.galeria).find((g) => !delTancament.has(g))).filter(Boolean);
  const cartells = sessions.map((s) => s.publica?.cartell).filter(Boolean);
  const ambFotogrames = fotogrames.length > 0;
  const usats = new Set([...delTancament, ...fotogrames]);
  const extres = ambFotogrames
    ? [...new Set(sessions.flatMap((s) => llista(s.publica?.galeria)).filter((g) => !usats.has(g)))].slice(0, MAX_EXTRES)
    : [];
  return {
    tipus: 'obertura-programacio',
    format: ambFotogrames ? 'fotogrames' : 'cartells',
    imatges: (ambFotogrames ? fotogrames : cartells).slice(0, MAX_PROGRAMACIO),
    extres,
    interval: rangDatesCa(sessions.map((s) => s.data)),
  };
}
