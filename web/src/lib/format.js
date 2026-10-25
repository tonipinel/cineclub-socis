import mesos from '../data/monthsCa.json';
import diesSetmana from '../data/weekdaysCa.json';

// Slug com el `urlize` de Hugo: minúscules, espais a "-", accents i "." conservats,
// apòstrofs i la resta de puntuació eliminats.
export function urlize(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}\p{M}.\-_]/gu, '');
}

// `text` de com a molt `max` caràcters (comptat el `…`), tallat a la darrera paraula sencera.
export function retalla(text, max) {
  if (text.length <= max) return text;
  const tros = text.slice(0, max - 1);
  const final = tros.lastIndexOf(' ');
  return `${(final > 0 ? tros.slice(0, final) : tros).replace(/[\s,;:.]+$/, '')}…`;
}

// Hora `H:MM` o `HH:MM` com a `HH:MM` (amb zero a l'esquerra, perquè l'ordre per text sigui l'horari);
// qualsevol altra cosa o una hora fora de rang, null.
export function horaNormal(hora) {
  const m = typeof hora === 'string' ? /^(\d{1,2}):(\d{2})$/.exec(hora.trim()) : null;
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

// `data` és 'AAAA-MM-DD' (s'ignora qualsevol part horària posterior).
function parteix(data) {
  const [any, mes, dia] = data.slice(0, 10).split('-').map(Number);
  const diaSetmana = new Date(Date.UTC(any, mes - 1, dia)).getUTCDay();
  return { any, mes, dia, diaSetmana };
}

// "Dijous 8 d'octubre": "d'" davant de vocal, "de " en la resta (com les plantilles de Hugo).
function diaMes(data) {
  const { mes, dia, diaSetmana } = parteix(data);
  const nomMes = mesos[String(mes)];
  const article = 'aeiou'.includes(nomMes[0]) ? "d'" : 'de ';
  return `${diesSetmana[String(diaSetmana)]} ${dia} ${article}${nomMes}`;
}

// Contracte de les tres variants (equivalents a date-ca.html, date-ca-short.html i
// date-ca-cartell.html). Les funcions de dades retornen les parts SENSE espais sobrants;
// els separadors que Hugo posa dins del HTML (l'espai inicial de `date-ca__rest`, l'espai
// entre els dos spans del cartell) els afegeixen els helpers `*Html`.
//
//   dataCa(data, hora?)      -> { principal: "Dijous 8 d'octubre", resta: '2026 - 19:00h' }
//   dataCaCurta(data, hora?) -> { principal: "Dijous 8 d'octubre", resta: '19:00h' }
//   dataCaCartell(data, hora?) -> { data: "Dijous 8 d'octubre", hora: 'a les 19:00h' }
//
// `data` és 'AAAA-MM-DD'; `hora` 'HH:MM'. Sense `hora`, la part de l'hora s'omet.
export function dataCa(data, hora) {
  const any = String(parteix(data).any);
  return { principal: diaMes(data), resta: hora ? `${any} - ${hora}h` : any };
}

export function dataCaCurta(data, hora) {
  return { principal: diaMes(data), resta: hora ? `${hora}h` : '' };
}

export function dataCaCartell(data, hora) {
  return { data: diaMes(data), hora: hora ? `a les ${hora}h` : '' };
}

// HTML exacte de les plantilles de Hugo (amb cometes als atributs; el minificador de Hugo les treu).
const spans = ({ principal, resta }) =>
  `<span class="date-ca__main">${principal}</span><span class="date-ca__rest"> ${resta}</span>`;

export const dataCaHtml = (data, hora) => spans(dataCa(data, hora));
export const dataCaCurtaHtml = (data, hora) => spans(dataCaCurta(data, hora));
export function dataCaCartellHtml(data, hora) {
  const { data: dia, hora: h } = dataCaCartell(data, hora);
  return `<div class="cartell__date-line"><span class="cartell__date">${dia}</span> <span class="cartell__date-time">${h}</span></div>`;
}

function desfasamentMadrid(instantMs) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Madrid',
    timeZoneName: 'longOffset',
  }).formatToParts(new Date(instantMs));
  const valor = parts.find((p) => p.type === 'timeZoneName').value; // "GMT+02:00"
  const m = valor.match(/GMT([+-])(\d{2}):(\d{2})/);
  return m ? (m[1] === '+' ? 1 : -1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
}

// ISO 8601 amb l'ofset d'Europe/Madrid: '2026-10-08', '19:00' -> '2026-10-08T19:00:00+02:00'.
export function dataIso(data, hora = '00:00') {
  const { any, mes, dia } = parteix(data);
  const [h, min] = hora.split(':').map(Number);
  const local = Date.UTC(any, mes - 1, dia, h, min);
  let ofset = desfasamentMadrid(local);
  ofset = desfasamentMadrid(local - ofset * 60000);
  const signe = ofset < 0 ? '-' : '+';
  const abs = Math.abs(ofset);
  const pad = (n) => String(n).padStart(2, '0');
  return `${data.slice(0, 10)}T${pad(h)}:${pad(min)}:00${signe}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

// `dataIso` de l'inici més `minuts`, també amb l'ofset d'Europe/Madrid d'aquell instant
// (la sessió pot acabar l'endemà o després d'un canvi d'hora).
export function dataIsoMesMinuts(data, hora, minuts) {
  const instant = new Date(Date.parse(dataIso(data, hora)) + minuts * 60000);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant).map((p) => [p.type, p.value]));
  return dataIso(`${parts.year}-${parts.month}-${parts.day}`, `${parts.hour}:${parts.minute}`);
}
