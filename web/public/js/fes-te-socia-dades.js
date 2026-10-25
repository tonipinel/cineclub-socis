// Un telèfon enganxat pot portar espais no separables o tabuladors, que les regles de Firestore no accepten.
export function netejarTelefon(valor) {
  return valor.replace(/\s+/g, " ").trim();
}
