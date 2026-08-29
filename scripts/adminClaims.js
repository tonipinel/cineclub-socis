export const ROLES_VALIDS = ['admin', 'taquilla'];

export function buildStaffClaims(role) {
  if (!ROLES_VALIDS.includes(role)) {
    throw new Error(`Rol desconegut: ${role}. Rols vàlids: ${ROLES_VALIDS.join(', ')}`);
  }
  return { role };
}
