// Sigles i explicació de la versió de la projecció (bloc `versio_tipus` de layouts/programacio/single.html).
// `idioma` només es fa servir a la versió original ("Versió Original en Anglès"); sense idioma, "Versió Original".
export function versioInfo(versioTipus, idioma) {
  switch (versioTipus) {
    case 'vo': return { sigles: 'V.O.', explicacio: idioma ? `Versió Original en ${idioma}` : 'Versió Original' };
    case 'vose': return { sigles: 'V.O.S.E.', explicacio: 'Versió Original Subtitulada en Espanyol' };
    case 'vosc': return { sigles: 'V.O.S.C.', explicacio: 'Versió Original Subtitulada en Català' };
    case 'doblada-cat': return { sigles: 'DOBL. CAT.', explicacio: 'Doblada al Català' };
    case 'doblada-cast': return { sigles: 'DOBL. CAST.', explicacio: 'Doblada al Castellà' };
    default: return { sigles: '', explicacio: '' };
  }
}
