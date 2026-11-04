import { distribuidoraPerId } from './distribuidores.js';

// Text fix que va sota els textos editorials de les sessions de FilmoXarxa.
export const TEXT_FILMOXARXA = `## FilmoXarxa

Aquesta projecció forma part de **FilmoXarxa**, una iniciativa de la Filmoteca de Catalunya i l'Institut Català de les Empreses Culturals (ICEC), amb la col·laboració de la Federació Catalana de Cineclubs, engegada el 2018.

El projecte té com a objectiu apropar el cinema d'autor a tot el territori català, potenciar i difondre el cinema català, europeu i internacional, ampliar l'oferta cinematogràfica en llengua catalana i fomentar la cultura cinematogràfica entre la ciutadania.

FilmoXarxa posa a disposició dels cineclubs pel·lícules inèdites o sense distribució comercial a Catalunya, seleccionades pel seu interès cultural i artístic. Les sessions es projecten en versió original subtitulada en català, facilitant l'accés a cinematografies i mirades que sovint queden fora dels circuits comercials.
`;

const esNomFilmoXarxa = (nom) => typeof nom === 'string' && nom.trim().toLowerCase() === 'filmoxarxa';

// Una sessió és de FilmoXarxa si la seva distribuïdora (resolta per id, que resisteix els canvis de nom, i si no pel
// nom en text de les sessions antigues) és «FilmoXarxa». La secció «Xarxa» no compta: és una cosa diferent.
export function esFilmoXarxa(sessio) {
  const p = sessio?.publica ?? {};
  const perId = p.suportDistribucioId ? distribuidoraPerId(p.suportDistribucioId) : null;
  return esNomFilmoXarxa(perId?.nom ?? p.suportDistribucio);
}
