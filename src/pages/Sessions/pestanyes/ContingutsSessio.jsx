import { useEffect, useState } from 'react';
import { AVIS_DESCRIPCIO } from '../../../lib/sessioPublica';
import { ESQUELET } from '../camps';
import TextareaAutomatic from '../../../components/TextareaAutomatic';
import Camp from './Camp';

// Markdown → HTML sanejat. `marked` i `dompurify` es carreguen només quan es fan servir.
async function renderitzar(cos) {
  const [{ marked }, { default: DOMPurify }] = await Promise.all([import('marked'), import('dompurify')]);
  return DOMPurify.sanitize(await marked.parse(cos));
}

const AJUDA_DESCRIPCIO = "Text que surt sota el títol als resultats de Google i quan es comparteix l'enllaç. Màxim 160 caràcters. Si el deixes buit, s'usa un text automàtic amb el títol, l'any, la direcció i quan es projecta.";
const AJUDA_SINOPSI_CARTELL = "Text breu del cartell imprimible i de la descripció de l'esdeveniment per als cercadors. Si el deixes buit, s'usa la secció «Sinopsi» del text editorial.";

function VistaPrevia({ cos }) {
  const [html, setHtml] = useState('');

  useEffect(() => {
    if (!cos.trim()) return undefined;
    let actiu = true;
    renderitzar(cos).then((resultat) => {
      if (actiu) setHtml(resultat);
    });
    return () => { actiu = false; };
  }, [cos]);

  return (
    <section className="fitxa-sessio__previa" aria-label="Vista prèvia">
      <h3 className="fitxa-sessio__previa-titol">Vista prèvia</h3>
      {html && cos.trim()
        ? <div className="fitxa-sessio__previa-cos" dangerouslySetInnerHTML={{ __html: html }} />
        : <p className="form__ajuda">Sense contingut.</p>}
    </section>
  );
}

export default function ContingutsSessio({ form, onCanviForm, errors }) {
  const props = { form, onCanviForm, errors };
  return (
    <div className="fitxa-sessio__targetes">
      <section className="fitxa-sessio__targeta" aria-labelledby="targeta-resums">
        <h2 className="fitxa-sessio__targeta-titol" id="targeta-resums">Resums</h2>
        <Camp
          camp="descripcio"
          etiqueta="Descripció (SEO)"
          ajuda={(
            <>
              <span>{form.descripcio.length}/160 caràcters</span>{' '}
              <span>{AJUDA_DESCRIPCIO}</span>
            </>
          )}
          avis={form.descripcio.trim().length > 160 ? AVIS_DESCRIPCIO : ''}
          {...props}
        />
        <Camp camp="sinopsiCartell" etiqueta="Sinopsi del cartell" ajuda={AJUDA_SINOPSI_CARTELL} {...props}>
          <TextareaAutomatic
            id="publica-sinopsiCartell"
            mida="curt"
            value={form.sinopsiCartell}
            onChange={(e) => onCanviForm('sinopsiCartell', e.target.value)}
            aria-describedby="publica-sinopsiCartell-ajuda"
          />
        </Camp>
      </section>

      <section className="fitxa-sessio__targeta" aria-labelledby="targeta-textos">
        <h2 className="fitxa-sessio__targeta-titol" id="targeta-textos">Textos editorials</h2>
        <div className="fitxa-sessio__editor">
          <div className="fitxa-sessio__editor-camp">
            <Camp
              camp="cos"
              etiqueta="Textos editorials (Markdown)"
              ajuda="Apartats amb «## Sinopsi», «## Context», «## Curiositats» i «## Per què l'hem programat?»."
              {...props}
            >
              <TextareaAutomatic
                id="publica-cos"
                mida="llarg"
                className="pagina-publica__cos"
                value={form.cos}
                onChange={(e) => onCanviForm('cos', e.target.value)}
                aria-describedby="publica-cos-ajuda"
              />
            </Camp>
            {!form.cos.trim() && (
              <button type="button" className="btn btn--outline pagina-publica__boto-petit" onClick={() => onCanviForm('cos', ESQUELET)}>
                Inserir l'esquelet
              </button>
            )}
          </div>
          <VistaPrevia cos={form.cos} />
        </div>
      </section>
    </div>
  );
}
