// Les sessions especials (`senseControl: true`) són esdeveniments gratuïts
// organitzats per altres entitats: no tenen control d'entrades, tiquets,
// despeses ni comptabilitat. Per a estadístiques, assistència i comptabilitat
// és com si no existissin.
export function sessionsAmbControl(sessions) {
  return sessions.filter((s) => s.senseControl !== true);
}
