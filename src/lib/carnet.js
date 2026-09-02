export function carnetPayload(soci) {
  return `SOCI-${soci.numeroSoci}`;
}

export function carnetQR(soci) {
  return `CARNET-${soci.tokenCarnet}`;
}
