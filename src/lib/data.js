// Sempre calculem "avui" en hora local, no UTC: `toISOString()` convertiria
// primer a UTC, fent que a la nit (entre les 22h i les 00h a l'estiu, per
// exemple) es calculés el dia d'ahir en comptes del d'avui.
export function avui() {
  return new Date().toLocaleDateString('sv-SE');
}
