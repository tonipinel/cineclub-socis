import entitats from '../data/entitats.json';
import distribuidors from '../data/distribuidors.json';

const cerca = (taula, nom) => (Object.hasOwn(taula, nom) ? taula[nom] : null);

// { logo, url } o null si el nom no existeix.
export const entitatPerNom = (nom) => cerca(entitats, nom);
export const distribuidoraPerNom = (nom) => cerca(distribuidors, nom);
