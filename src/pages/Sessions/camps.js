// Camps de la fitxa de sessió i a quina pestanya pertany cadascun.

export const FITXA = [
  ['titolTraduit', 'Títol en català', 'Surt sota el títol original. Si és buit, no hi ha subtítol.'],
  ['titolEspanya', 'Títol a Espanya', 'Només a la fitxa tècnica.'],
  ['directors', 'Direcció', 'Separats per comes'],
  ['guio', 'Guió'],
  ['pais', 'País'],
  ['any', 'Any'],
  ['durada', 'Durada (minuts)'],
  ['idioma', 'Idioma'],
  ['generes', 'Gèneres', 'Separats per comes'],
  ['fotografia', 'Fotografia'],
  ['muntatge', 'Muntatge'],
  ['musica', 'Música'],
  ['produccio', 'Producció'],
  ['interprets', 'Intèrprets', 'Separats per comes'],
  ['premisDestacats', 'Premis destacats'],
];

export const GESTIO = [
  ['preu', "Preu d'entrada (€)", '0 = entrada gratuïta; buit = sense preu'],
  ['queInclou', 'Què inclou'],
  ['edatMinimaRecomanada', 'Edat mínima recomanada', '0 = tots els públics'],
];

export const VERSIONS = [
  ['', '—'], ['vo', 'V.O.'], ['vose', 'V.O.S.E.'], ['vosc', 'V.O.S.C.'], ['doblada-cat', 'Doblada al català'], ['doblada-cast', 'Doblada al castellà'],
];
export const SECCIONS = [['', 'Cartellera (per defecte)'], ['cartellera', 'Cartellera'], ['xarxa', 'Xarxa'], ['extra', 'Extra']];

export const ESQUELET = "## Sinopsi\n\n\n\n## Context\n\n\n\n## Curiositats\n\n\n\n## Per què l'hem programat?\n\n";

export const PESTANYES = ['estadistiques', 'dades', 'continguts', 'mitjans'];

export const ETIQUETA_PESTANYA = {
  estadistiques: 'Estadístiques', dades: 'Dades', continguts: 'Continguts', mitjans: 'Mitjans',
};

const de = (camps, pestanya) => Object.fromEntries(camps.map((camp) => [camp, pestanya]));

export const PESTANYA_DEL_CAMP = {
  ...de(['titol', 'titolOriginal', 'data', 'hora', 'slug', 'publicada', 'urlProgramacio', 'imatgeUrl', 'versioTipus', 'seccio'], 'dades'),
  ...de(FITXA.map(([camp]) => camp), 'dades'),
  ...de(GESTIO.map(([camp]) => camp), 'dades'),
  ...de(['suportDistribucio', 'suportDistribucioId', 'organitza', 'participa', 'collabora'], 'dades'),
  ...de(['descripcio', 'sinopsiCartell', 'cos'], 'continguts'),
  ...de(['cartell', 'galeria', 'trailerYoutubeId'], 'mitjans'),
};
