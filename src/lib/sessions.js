// Les sessions especials (`senseControl: true`) són esdeveniments gratuïts
// organitzats per altres entitats: no tenen control d'entrades, tiquets,
// despeses ni comptabilitat. Per a estadístiques, assistència i comptabilitat
// és com si no existissin.
export function sessionsAmbControl(sessions) {
  return sessions.filter((s) => s.senseControl !== true);
}

const urlHttp = (valor) => {
  if (typeof valor !== 'string') return false;
  try {
    return ['http:', 'https:'].includes(new URL(valor).protocol);
  } catch {
    return false;
  }
};

// Única font de la imatge d'una sessió per mostrar-la a l'admin: el cartell de la pàgina pública
// (`publica.cartell`, a Storage) i, si no n'hi ha, `imatgeUrl`, que només és el valor de reserva.
export function imatgeDeSessio(sessio) {
  return [sessio?.publica?.cartell, sessio?.imatgeUrl].find(urlHttp) ?? null;
}
