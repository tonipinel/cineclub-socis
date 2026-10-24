// Missatge de bloqueig d'eliminar d'una fitxa de catàleg: «No es pot eliminar: l'usa 1 sessió (Pig)».
export function missatgeBloqueigEliminar(nombre, singular, plural, titols = []) {
  const recompte = nombre === 1 ? `l'usa 1 ${singular}` : `l'usen ${nombre} ${plural}`;
  const noms = titols.filter(Boolean);
  return `No es pot eliminar: ${recompte}${noms.length ? ` (${noms.join(', ')})` : ''}`;
}
