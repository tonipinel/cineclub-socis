// Lògica pura de "Desar" d'una sessió: validació de la fitxa pública, alies, URL de programació i diff.
// Sense Firestore: les altres sessions i la confirmació de l'alies arriben per paràmetre.
// `confirmarAlias` pot tornar un booleà o una promesa d'un booleà (el diàleg de confirmació).
import {
  afegirAlias, camiPublic, ERROR_DESCRIPCIO, formulariAPublica, marcarActualitzada, netejarPublica, urlPublica, validarPublicable,
} from './sessioPublica';

export const CAMPS_INICIALS = {
  titol: '', data: '', hora: '19:00', urlProgramacio: '', imatgeUrl: '',
};

export const MISSATGE_ALIAS = "Això trencarà l'URL anterior; s'afegirà com a alias perquè continuï funcionant.";

const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const senseActualitzatEl = ({ actualitzatEl: _data, ...resta } = {}) => resta;

// Noms de camp diferents (la fitxa pública es compara amb el formulari inicial). Ignora `activa`.
export function campsCanviats(dades, original, publicaForm, publicaInicial) {
  const abans = { ...CAMPS_INICIALS, ...original };
  const { activa: _activa, ...sense } = dades;
  return {
    dades: Object.keys(sense).filter((camp) => !igual(sense[camp], abans[camp])),
    publica: Object.keys(publicaForm).filter((camp) => !igual(publicaForm[camp], publicaInicial[camp])),
  };
}

export async function prepararDesat({
  id, dades, publicaForm, publicaInicial, original, altresSessions, ara = new Date(), confirmarAlias,
}) {
  const publicaCanviada = !igual(publicaForm, publicaInicial);
  const conversio = formulariAPublica(publicaForm);
  // La fitxa pública desada sense tocar no bloqueja res (p. ex. una descripció llarga migrada de Hugo).
  const errors = publicaCanviada ? conversio.errors : {};
  let publica = publicaCanviada ? netejarPublica({ ...original.publica, ...conversio.publica }) : original.publica;
  const nou = { ...dades };
  const publicaPerPrimerCop = nou.publicada && !original.publicada;
  if (publicaPerPrimerCop && conversio.avisos.descripcio) errors.descripcio = ERROR_DESCRIPCIO;
  if (nou.publicada) {
    const validacio = validarPublicable({ ...nou, id, publica: publica ?? {} }, altresSessions);
    if (!validacio.valid) errors.publicar = validacio.errors;
  }
  if (Object.keys(errors).length > 0) {
    return { errors, cancelat: false, dadesADesar: {}, canvis: {}, publicaFinal: undefined };
  }
  const camiAntic = original.publicada ? camiPublic(original.data, original.slug) : '';
  const camiCanviat = camiPublic(nou.data, nou.slug) !== camiPublic(original.data, original.slug);
  let aliasNou = false;
  if (nou.publicada && (publicaPerPrimerCop || camiCanviat)) nou.urlProgramacio = urlPublica(nou.data, nou.slug);
  if (camiAntic && camiCanviat) {
    if (!(await confirmarAlias())) return { errors: {}, cancelat: true, dadesADesar: {}, canvis: {}, publicaFinal: undefined };
    aliasNou = true;
    publica = { ...netejarPublica(publica), aliases: afegirAlias(publica?.aliases, camiAntic) };
  }
  // `publica.actualitzatEl` (el `lastmod` del sitemap) només es mou amb un canvi real de la fitxa pública (no amb un
  // formulari tocat i desfet o que en desar queda igual) o amb un alias nou (canvi de data o slug publicats) o amb un canvi d'hora d'una sessió publicada. Mai
  // amb `activa` ni amb els camps de gestió.
  const abans = { ...CAMPS_INICIALS, ...original };
  const publicaReal = publicaCanviada
    && !igual(senseActualitzatEl(publica), senseActualitzatEl(netejarPublica(original.publica)));
  const horaPublicaCanviada = Boolean(nou.publicada) && nou.hora !== abans.hora;
  if (publicaReal || aliasNou || horaPublicaCanviada) {
    publica = marcarActualitzada(publica, ara);
    nou.publica = publica;
    if (publica.cartell && publica.cartell !== original.publica?.cartell) nou.imatgeUrl = publica.cartell;
  }
  // El camp `activa` és exclusiu de "Marcar com a activa": un "Desar" normal mai l'ha de sobreescriure
  // amb l'estat local, que pot haver quedat desactualitzat.
  const { activa: _activaActual, ...dadesADesar } = nou;
  const canvis = Object.fromEntries(Object.entries(dadesADesar).filter(([camp, valor]) => !igual(valor, abans[camp])));
  return { errors: {}, cancelat: false, dadesADesar, canvis, publicaFinal: publica };
}
