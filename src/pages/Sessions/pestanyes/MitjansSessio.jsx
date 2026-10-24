import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ref, uploadBytes } from 'firebase/storage';
import { storage } from '../../../firebase/firebase';
import { esSlugValid, idYoutube } from '../../../lib/sessioPublica';
import { afegirUrls, pujarImatges } from '../../../lib/pujadaImatges';
import Camp from './Camp';
import GaleriaImatges from './GaleriaImatges';
import ZonaPujada from './ZonaPujada';

const MOTIU_SENSE_SLUG = 'Cal un slug per poder pujar imatges.';
const pujarFitxer = (cami, f) => uploadBytes(ref(storage, cami), f, { contentType: f.type });

// `onPujant(bool)`: avisa la fitxa quan comença i acaba una pujada (encara que s'hagi canviat de pestanya).
export default function MitjansSessio({
  dades, form, onCanviForm, errors, onPujant = () => {},
}) {
  const [pujant, setPujant] = useState(false);
  const [estatsCartell, setEstatsCartell] = useState([]);
  const [estatsGaleria, setEstatsGaleria] = useState([]);
  // La pujada acaba més tard: la galeria nova es calcula sobre l'actual, no sobre la d'abans de pujar
  // (si no, es perdria el que s'hagi tret o reordenat mentrestant).
  const galeriaActual = useRef(form.galeria);
  useLayoutEffect(() => {
    galeriaActual.current = form.galeria;
  }, [form.galeria]);

  const slug = dades.slug ?? '';
  const potPujar = esSlugValid(slug) && !pujant;
  const motiu = esSlugValid(slug) ? '' : MOTIU_SENSE_SLUG;
  const idTrailer = idYoutube(form.trailerYoutubeId);

  // Si deixes anar una imatge fora de la zona, el navegador l'obriria i sortiries de l'admin.
  useEffect(() => {
    const evita = (e) => {
      if (e.dataTransfer?.types?.includes('Files')) e.preventDefault();
    };
    window.addEventListener('dragover', evita);
    window.addEventListener('drop', evita);
    return () => {
      window.removeEventListener('dragover', evita);
      window.removeEventListener('drop', evita);
    };
  }, []);

  const pujar = async (fitxers, tipus, setEstats) => {
    const estats = fitxers.map((f) => ({ nom: f.name, estat: 'pujant' }));
    setEstats(estats);
    setPujant(true);
    onPujant(true);
    try {
      const resultats = await pujarImatges(fitxers, {
        slug,
        tipus,
        bucket: storage.app.options.storageBucket,
        pujarFitxer,
        onProgres: (fitxer, estat) => setEstats((actuals) => actuals.map((e, i) => (fitxers[i] === fitxer ? { ...e, estat } : e))),
      });
      setEstats(resultats.map(({ fitxer, error }) => (error
        ? { nom: fitxer.name, estat: 'error', missatge: error }
        : { nom: fitxer.name, estat: 'ok' })));
      return resultats.filter((r) => r.url).map((r) => r.url);
    } finally {
      setPujant(false);
      onPujant(false);
    }
  };

  const pujarCartell = async (fitxers) => {
    const [url] = await pujar(fitxers, 'poster', setEstatsCartell);
    if (url) onCanviForm('cartell', url);
  };

  const pujarGaleria = async (fitxers) => {
    const urls = await pujar(fitxers, 'gallery', setEstatsGaleria);
    if (urls.length) onCanviForm('galeria', afegirUrls(galeriaActual.current, urls));
  };

  return (
    <div className="fitxa-sessio__targetes">
      <section className="fitxa-sessio__targeta" aria-labelledby="targeta-cartell">
        <h2 className="fitxa-sessio__targeta-titol" id="targeta-cartell">Cartell</h2>
        <div className="fitxa-sessio__cartell-mitjans">
          {form.cartell
            ? <img className="fitxa-sessio__cartell-imatge" src={form.cartell} alt="Cartell" />
            : <p className="form__ajuda">Sense cartell.</p>}
          <ZonaPujada
            id="publica-cartell"
            etiqueta="Pujar cartell"
            habilitada={potPujar}
            motiuDeshabilitada={motiu}
            onFitxers={pujarCartell}
            estats={estatsCartell}
          />
        </div>
      </section>

      <section className="fitxa-sessio__targeta" aria-labelledby="targeta-galeria">
        <h2 className="fitxa-sessio__targeta-titol" id="targeta-galeria">Galeria</h2>
        <GaleriaImatges
          galeria={form.galeria}
          cartell={form.cartell}
          onCanviGaleria={(llista) => onCanviForm('galeria', llista)}
          onFerCartell={(url) => onCanviForm('cartell', url)}
        />
        <ZonaPujada
          id="publica-galeria"
          etiqueta="Afegir imatges a la galeria"
          habilitada={potPujar}
          motiuDeshabilitada={motiu}
          multiple
          onFitxers={pujarGaleria}
          estats={estatsGaleria}
        />
      </section>

      <section className="fitxa-sessio__targeta" aria-labelledby="targeta-trailer">
        <h2 className="fitxa-sessio__targeta-titol" id="targeta-trailer">Tràiler</h2>
        <Camp camp="trailerYoutubeId" etiqueta="Tràiler de YouTube (URL o id)" form={form} onCanviForm={onCanviForm} errors={errors} />
        {idTrailer && (
          <iframe
            className="fitxa-sessio__trailer"
            src={`https://www.youtube-nocookie.com/embed/${idTrailer}`}
            title="Tràiler"
            loading="lazy"
            allow="encrypted-media; picture-in-picture"
            allowFullScreen
          />
        )}
      </section>
    </div>
  );
}
