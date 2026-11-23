import { forwardRef, useMemo } from 'react';
import {
  FOTOGRAMES_FONS, FOTOGRAMES_TANCAMENT, LLOC, composaFonsTires, composaTires, diaMesCa, disposicioMosaic, fraseVersio, negretaAHtml, repartiment, seccioDe,
} from '../../lib/social';

const LOGO = '/images/social/cineclub-roda-de-bera.png';
const LOGO_AJUNTAMENT = '/images/social/ajuntament-roda-de-bera.png';
// Alçada que queda per al mosaic de l'obertura un cop posats el logo i el títol.
const ALCADA_MOSAIC = 850;
// Mateixa llista buida a cada render, perquè les dependències de useMemo no canviïn.
const SENSE_EXTRES = [];

const titolDe = (sessio) => sessio.publica?.titol || sessio.titol;
const horaDe = (sessio) => (sessio.hora ? `${sessio.hora}h` : '');
// Dia i hora en una sola línia: la lletra s'ajusta a l'ample perquè hi càpiga la data més llarga (Oswald en majúscules, ~0,52 em per lletra).
const midaQuan = (sessio) => Math.min(84, Math.floor(950 / (`${diaMesCa(sessio.data)} ${horaDe(sessio)}`.length * 0.52)));
const midaText = (text) => {
  if (text.length <= 60) return 'xl';
  if (text.length <= 120) return 'l';
  if (text.length <= 180) return 'm';
  if (text.length <= 240) return 's';
  return 'xs';
};

// Dia i hora en una línia («Dijous 22 d'octubre 19:00h»).
function Quan({ sessio }) {
  const llarga = `${diaMesCa(sessio.data)} ${horaDe(sessio)}`.length > 28;
  return (
    <p className={`social-slide__quan${llarga ? ' social-slide__quan--llarga' : ''}`}>
      <span className="social-slide__dia">{diaMesCa(sessio.data)}</span>
      {horaDe(sessio) && <>{' '}<span className="social-slide__hora">{horaDe(sessio)}</span></>}
    </p>
  );
}

function Franja({ posicio, children }) {
  return <div className={`social-slide__franja social-slide__franja--${posicio}`}>{children}</div>;
}

// Peu de la portada: col·laboradors (que no són el Cineclub) i, sempre, la distribuïdora.
function PeuPortada({ logos, font }) {
  return (
    <div className="social-slide__peu">
      {logos.length > 0 && (
        <div className="social-slide__peu-grup">
          <span className="social-slide__peu-text">Amb la col·laboració de:</span>
          {logos.map((logo) => <img key={logo} className="social-slide__logo-entitat" src={font(logo)} alt="" />)}
        </div>
      )}
    </div>
  );
}

// Tires de pel·lícula que travessen la imatge de costat a costat i es tallen per les vores. Cada tira és contínua: perforacions
// a dalt i a baix i els fotogrames connectats (els principals al mig; els dels costats, d'altres imatges de les mateixes pel·lícules).
function Tires({ imatges, extres, font }) {
  const tires = useMemo(() => composaTires(imatges, extres, { alcada: ALCADA_MOSAIC }), [imatges, extres]);
  return (
    <div className="social-slide__tires">
      {tires.map((t, f) => (
        <div key={`${f}-${t.principals[0]}`} className="social-slide__tira">
          <span className="social-slide__perforacions" />
          <div className="social-slide__tira-fotogrames">
            {[...t.esquerra.map((url) => ({ url })), ...t.principals.map((url) => ({ url, principal: true })), ...t.dreta.map((url) => ({ url }))]
              .map(({ url, principal }, i) => (
                <img
                  key={`${i}-${url}`}
                  className={`social-slide__tira-imatge${principal ? ' social-slide__tira-principal' : ''}`}
                  src={font(url)}
                  alt=""
                  style={{ width: t.w, height: t.h }}
                />
              ))}
          </div>
          <span className="social-slide__perforacions" />
        </div>
      ))}
    </div>
  );
}

// Mosaic de cartells verticals de l'obertura (quan cap sessió té un fotograma lliure).
function MosaicCartells({ imatges, font }) {
  const { files, w, h } = useMemo(() => disposicioMosaic(imatges.length, { alcada: ALCADA_MOSAIC, aspecte: 2 / 3 }), [imatges.length]);
  return (
    <div className="social-slide__mosaic">
      {repartiment(imatges, files).map((fila, f) => (
        <div key={`${f}-${fila[0]}`} className="social-slide__mosaic-fila">
          {fila.map((url, i) => <img key={`${i}-${url}`} className="social-slide__mosaic-cartell" src={font(url)} alt="" style={{ width: w, height: h }} />)}
        </div>
      ))}
    </div>
  );
}

// Mosaic de l'obertura d'una publicació de Programació: tires de pel·lícula amb fotogrames o, si no n'hi ha, cartells verticals.
function Mosaic({ imatges, extres, format, font }) {
  if (format === 'fotogrames') return <Tires imatges={imatges} extres={extres} font={font} />;
  return <MosaicCartells imatges={imatges} font={font} />;
}

// Fons de la portada d'una pel·lícula: dues tires de pel·lícula (amb fotogrames de la pel·lícula) que travessen la imatge de costat a
// costat, lleugerament girades i opaques, damunt del mosaic de fons; el cartell les tapa pel mig.
function FonsTires({ imatges, font }) {
  const tires = useMemo(() => composaFonsTires(imatges), [imatges]);
  return (
    <div className="social-slide__fons-tires">
      <div className="social-slide__fons-tires-rotades">
        {tires.map((t, f) => (
          <div key={f} className="social-slide__tira">
            <span className="social-slide__perforacions" />
            <div className="social-slide__tira-fotogrames">
              {t.fotogrames.map((url, i) => (
                <img
                  key={`${i}-${url}`}
                  className={`social-slide__tira-imatge${t.vistos.includes(i) ? ' social-slide__tira-imatge--vista' : ''}`}
                  src={font(url)}
                  alt=""
                  style={{ width: t.w, height: t.h }}
                />
              ))}
            </div>
            <span className="social-slide__perforacions" />
          </div>
        ))}
      </div>
    </div>
  );
}

// Fotogrames en «negatius» de pel·lícula, de dos en dos; si en sobra un, es queda centrat i de la mateixa mida.
function Collage({ fotogrames, font }) {
  const files = Array.from({ length: Math.ceil(fotogrames.length / 2) }, (_, i) => fotogrames.slice(i * 2, i * 2 + 2));
  return (
    <div className="social-slide__collage">
      {files.map((fila, f) => (
        <div key={f} className="social-slide__collage-fila">
          {fila.map((url, i) => (
            <figure key={`${i}-${url}`} className="social-slide__negatiu">
              <img className="social-slide__negatiu-imatge" src={font(url)} alt="" />
              <figcaption className="social-slide__negatiu-text">Film negative</figcaption>
            </figure>
          ))}
        </div>
      ))}
    </div>
  );
}

// Una diapositiva de 1080 × 1350 px. `imatges` és un mapa URL → `data:` per a l'exportació; sense, es fa servir la URL.
const Diapositiva = forwardRef(function Diapositiva({
  sessio, diapositiva, logos = [], distribuidora = null, filmoxarxa = false, imatges = {},
}, ref) {
  const font = (url) => imatges[url] ?? url;
  const cartell = sessio.publica?.cartell;
  const titol = titolDe(sessio);
  const { tipus } = diapositiva;
  const seccio = seccioDe(sessio);
  const programacio = tipus === 'tancament-programacio';
  const obertura = tipus === 'obertura-programacio';
  const portadaPelicula = tipus === 'portada-pelicula';
  const fotogrames = programacio
    ? diapositiva.imatges
    : (Array.isArray(sessio.publica?.galeria) ? sessio.publica.galeria.slice(0, FOTOGRAMES_TANCAMENT) : []);
  let classeTipus = tipus;
  if (programacio) classeTipus = 'tancament';
  if (obertura) classeTipus = 'obertura';
  const galeria = sessio.publica?.galeria;
  const fonsPelicula = useMemo(
    () => (portadaPelicula && Array.isArray(galeria) ? galeria.slice(0, FOTOGRAMES_FONS) : SENSE_EXTRES),
    [portadaPelicula, galeria],
  );
  const ambCapcalera = tipus === 'portada-programacio';

  return (
    <article
      ref={ref}
      className={`social-slide social-slide--${classeTipus}`}
    >
      <div className="social-slide__fons" />
      {fonsPelicula.length > 0 && <FonsTires imatges={fonsPelicula} font={font} />}
      {portadaPelicula && (
        <div className="social-slide__pelicula-franja">
          <span className="social-slide__seccio-pelicula" style={{ backgroundColor: seccio.color, color: seccio.text }}>{seccio.nom}</span>
          <div className="social-slide__pelicula-degradat" />
          {distribuidora && (
            <div className="social-slide__pelicula-distribuidora">
              <img className="social-slide__pelicula-logo" src={font(distribuidora)} alt="" />
            </div>
          )}
        </div>
      )}
      {portadaPelicula && <span className="social-slide__pelicula-filet" aria-hidden="true" />}
      {ambCapcalera && (
        <Franja posicio="dalt">
          <span className="social-slide__seccio-programacio" style={{ backgroundColor: seccio.color, color: seccio.text }}>{seccio.nom}</span>
          <Quan sessio={sessio} />
        </Franja>
      )}
      <div className="social-slide__contingut">
        {portadaPelicula && (
          <>
            <div className="social-slide__pelicula-capcalera">
              <img className="social-slide__logo social-slide__logo--pelicula" src={LOGO} alt="Cineclub Roda de Berà" />
              <p className="social-slide__pelicula-quan" style={{ fontSize: midaQuan(sessio) }}>
                <span>{diaMesCa(sessio.data)}</span>
                {horaDe(sessio) && <>{' '}<span>{horaDe(sessio)}</span></>}
              </p>
            </div>
            {cartell
              ? <div className="social-slide__pelicula-marc"><img className="social-slide__pelicula-cartell" src={font(cartell)} alt={titol} /></div>
              : <p className="social-slide__titol">{titol}</p>}
          </>
        )}
        {obertura && (
          <>
            <div className="social-slide__obertura-capcalera">
              <img className="social-slide__logo social-slide__logo--obertura" src={LOGO} alt="Cineclub Roda de Berà" />
              <p className="social-slide__programacio">Programació</p>
              <p className="social-slide__interval">{diapositiva.interval}</p>
            </div>
            <Mosaic imatges={diapositiva.imatges} extres={diapositiva.extres ?? SENSE_EXTRES} format={diapositiva.format} font={font} />
          </>
        )}
        {tipus === 'portada-programacio' && (
          cartell
            ? <div className="social-slide__marc"><img className="social-slide__cartell" src={font(cartell)} alt={titol} /></div>
            : <p className="social-slide__titol">{titol}</p>
        )}
        {tipus === 'curiositat' && (
          <>
            {diapositiva.imatge && <img className="social-slide__fotograma" src={font(diapositiva.imatge)} alt="" />}
            <div className="social-slide__targeta">
              <p
                className={`social-slide__text social-slide__text--${midaText(diapositiva.text)}`}
                dangerouslySetInnerHTML={{ __html: negretaAHtml(diapositiva.text) }}
              />
            </div>
            {filmoxarxa && distribuidora ? (
              <div className="social-slide__logos-parella">
                <img className="social-slide__logo" src={LOGO} alt="Cineclub Roda de Berà" />
                <span className="social-slide__pastilla">
                  <img className="social-slide__logo-filmoxarxa" src={font(distribuidora)} alt="" />
                </span>
              </div>
            ) : <img className="social-slide__logo" src={LOGO} alt="Cineclub Roda de Berà" />}
          </>
        )}
        {(tipus === 'tancament' || programacio) && (
          <>
            {fotogrames.length > 0 && <Collage fotogrames={fotogrames} font={font} />}
            {fotogrames.length === 0 && !programacio && <p className="social-slide__titol">{titol}</p>}
            <div className="social-slide__targeta social-slide__targeta--tancament">
              <p className="social-slide__invitacio">
                <span className="social-slide__invitacio-linia">Vine al <strong>Cineclub Roda de Berà</strong></span>
                <span className="social-slide__invitacio-linia">{programacio ? 'i gaudeix del cinema' : 'i gaudeix de la pel·lícula'}</span>
                {programacio && diapositiva.versio && <span className="social-slide__invitacio-linia"><strong>en Versió Original</strong></span>}
                {!programacio && fraseVersio(sessio) && <span className="social-slide__invitacio-linia"><strong>{fraseVersio(sessio)}</strong></span>}
              </p>
              <div className="social-slide__separador" />
              {!programacio && <Quan sessio={sessio} />}
              <p className="social-slide__lloc">{LLOC}</p>
              <p className="social-slide__web">cineclubrodadebera.cat</p>
            </div>
            <div className="social-slide__logos-parella">
              <img className="social-slide__logo" src={LOGO} alt="Cineclub Roda de Berà" />
              <div className="social-slide__colabora">
                <span className="social-slide__colabora-text">Amb la col·laboració de:</span>
                <span className="social-slide__pastilla">
                  <img className="social-slide__logo-ajuntament" src={LOGO_AJUNTAMENT} alt="Ajuntament de Roda de Berà" />
                </span>
              </div>
              {!programacio && filmoxarxa && distribuidora && (
                <span className="social-slide__pastilla">
                  <img className="social-slide__logo-filmoxarxa" src={font(distribuidora)} alt="" />
                </span>
              )}
            </div>
          </>
        )}
      </div>
      {portadaPelicula && logos.length > 0 && (
        <div className="social-slide__pelicula-colabora">
          <span className="social-slide__pelicula-colabora-text">Amb la col·laboració de:</span>
          {logos.map((logo) => <img key={logo} className="social-slide__pelicula-logo" src={font(logo)} alt="" />)}
        </div>
      )}
      {tipus === 'portada-programacio' && (
        <Franja posicio="baix">
          {/* El filet va abans que el logo: així el logo del Cineclub es pinta damunt del filet i no al revés. */}
          <span className="social-slide__filet" aria-hidden="true" />
          <img className="social-slide__logo social-slide__logo--peu-programacio" src={LOGO} alt="Cineclub Roda de Berà" />
          <PeuPortada logos={logos} font={font} />
          {distribuidora && (
            <div className="social-slide__peu-distribuidora">
              <img className="social-slide__logo-distribuidora" src={font(distribuidora)} alt="" />
            </div>
          )}
        </Franja>
      )}
    </article>
  );
});

export default Diapositiva;
