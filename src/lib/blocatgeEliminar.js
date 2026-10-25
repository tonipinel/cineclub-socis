const recompteUs = (nombre, singular, plural, titols = []) => {
  const recompte = nombre === 1 ? `l'usa 1 ${singular}` : `l'usen ${nombre} ${plural}`;
  const noms = titols.filter(Boolean);
  return `${recompte}${noms.length ? ` (${noms.join(', ')})` : ''}`;
};

// Missatge de bloqueig d'eliminar d'una fitxa de catàleg: «No es pot eliminar: l'usa 1 sessió (Pig)».
export function missatgeBloqueigEliminar(nombre, singular, plural, titols = []) {
  return `No es pot eliminar: ${recompteUs(nombre, singular, plural, titols)}`;
}

// Igual, amb diversos tipus de dependència ({ nombre, singular, plural, titols }); `null` si no n'hi ha cap.
export function missatgeBloqueigEliminarDiversos(usos) {
  const parts = usos.filter((u) => u.nombre > 0).map((u) => recompteUs(u.nombre, u.singular, u.plural, u.titols));
  return parts.length ? `No es pot eliminar: ${parts.join(' i ')}` : null;
}
