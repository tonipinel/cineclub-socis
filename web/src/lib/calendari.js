import { titolSessio, urlSessio } from './sessio-camps.js';
import { dataIso } from './format.js';

// Any i mes (1-12) de `ara` a Europe/Madrid.
function anyMesMadrid(ara) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Madrid', year: 'numeric', month: 'numeric' }).formatToParts(ara);
  return [Number(parts.find((p) => p.type === 'year').value), Number(parts.find((p) => p.type === 'month').value)];
}

const pad = (n) => String(n).padStart(2, '0');

// `listing` de `programacio/list.html`: les sessions i, sempre, 3 «Per determinar» al primer
// dijous a les 19:00 (Madrid) dels propers mesos (24 com a màxim) sense cap sessió de cartellera.
// Retorna `{ data: 'AAAA-MM-DD', hora, titol, url }` ordenat per data (`url` buida als pendents).
export function elementsCalendari(sessions, ara, pendents = 3) {
  const items = sessions.map((s) => ({ data: s.data.slice(0, 10), hora: s.hora || '00:00', titol: titolSessio(s), url: urlSessio(s) }));
  const mesosCartellera = new Set(
    sessions.filter((s) => s.publica?.seccio === 'cartellera').map((s) => s.data.slice(0, 7)),
  );
  const [anyInici, mesInici] = anyMesMadrid(ara);
  let afegits = 0;
  for (let desplacament = 0; desplacament < 24 && afegits < pendents; desplacament += 1) {
    const mesTotal = mesInici - 1 + desplacament;
    const any = anyInici + Math.floor(mesTotal / 12);
    const mes = (mesTotal % 12) + 1;
    if (mesosCartellera.has(`${any}-${pad(mes)}`)) continue;
    const diaSetmanaPrimer = new Date(Date.UTC(any, mes - 1, 1)).getUTCDay();
    const data = `${any}-${pad(mes)}-${pad(1 + ((4 - diaSetmanaPrimer + 7) % 7))}`;
    if (new Date(dataIso(data, '19:00')) > ara) {
      items.push({ data, hora: '19:00', titol: 'Per determinar', url: '' });
      afegits += 1;
    }
  }
  const clau = (e) => `${e.data} ${e.hora}`;
  return items.sort((a, b) => (clau(a) < clau(b) ? -1 : clau(a) > clau(b) ? 1 : 0));
}
