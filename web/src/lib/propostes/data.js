// Sempre calculem "avui" en hora local, no UTC: `toISOString()` convertiria
// primer a UTC, fent que a la nit (entre les 22h i les 00h a l'estiu, per
// exemple) es calculés el dia d'ahir en comptes del d'avui.
export function avui() {
  return new Date().toLocaleDateString('sv-SE');
}

// Format únic per mostrar dates a l'usuari: dd/mm/aaaa, sempre amb dos
// dígits. Accepta tant una data ISO (yyyy-mm-dd, tal com es guarda a
// Firestore i als <input type="date">) com un objecte Date ja calculat.
export function formatData(data) {
  if (!data) return '—';
  let dataObj = data;
  if (!(dataObj instanceof Date)) {
    const [any, mes, dia] = data.split('-').map(Number);
    dataObj = new Date(any, mes - 1, dia);
  }
  const dia = String(dataObj.getDate()).padStart(2, '0');
  const mes = String(dataObj.getMonth() + 1).padStart(2, '0');
  return `${dia}/${mes}/${dataObj.getFullYear()}`;
}

// Accepta tant un Timestamp de Firestore (amb `.toDate()`) com un Date ja
// convertit.
export function formatDataHora(valor) {
  const data = typeof valor?.toDate === 'function' ? valor.toDate() : valor;
  if (!data) return '—';
  return `${formatData(data)} ${data.toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit' })}`;
}
