export function properNumeroSoci(numerosExistents) {
  const numeros = numerosExistents
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n > 0);
  const maxim = numeros.length > 0 ? Math.max(...numeros) : 0;
  return maxim + 1;
}
