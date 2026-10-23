import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react';

const FILES = { curt: 3, llarg: 8 };

// Ancestre amb scroll propi més proper (o null si només scrolla la finestra)
function ancestreAmbScroll(el) {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node;
  }
  return null;
}

function useAjustaAlcada(ref, value) {
  const ajusta = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // Restaurem l'scroll perquè encongir el document no el faci saltar
    const { scrollX, scrollY } = window;
    const ancestre = ancestreAmbScroll(el);
    const scrollAncestre = ancestre?.scrollTop;
    el.style.height = 'auto';
    const contingut = el.scrollHeight;
    // Amagat (display:none) scrollHeight és 0: deixem que mani `rows`
    if (contingut === 0) {
      el.style.height = '';
    } else {
      // Amb box-sizing: border-box cal afegir-hi les vores
      const vores = el.offsetHeight - el.clientHeight;
      el.style.height = `${contingut + vores}px`;
    }
    if (ancestre) ancestre.scrollTop = scrollAncestre;
    if (window.scrollX !== scrollX || window.scrollY !== scrollY) window.scrollTo(scrollX, scrollY);
  }, [ref]);

  useLayoutEffect(ajusta, [ajusta, value]);

  useEffect(() => {
    window.addEventListener('resize', ajusta);
    return () => window.removeEventListener('resize', ajusta);
  }, [ajusta]);

  // En tornar-se visible o canviar l'amplada (reflux del text) es torna a mesurar.
  // Només reaccionem als canvis d'amplada: l'alçada canvia en arrossegar l'usuari.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    let ultimaAmplada = null;
    let frame;
    const observador = new ResizeObserver(([entrada]) => {
      const amplada = entrada.contentRect.width;
      if (amplada === ultimaAmplada) return;
      ultimaAmplada = amplada;
      // Diferit: canviar l'alçada dins del callback provoca l'avís «ResizeObserver loop»
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(ajusta);
    });
    observador.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      observador.disconnect();
    };
  }, [ref, ajusta]);

  return ajusta;
}

const TextareaAutomatic = forwardRef(function TextareaAutomatic({ mida = 'llarg', className, onInput, ...props }, refExtern) {
  const ref = useRef(null);
  useImperativeHandle(refExtern, () => ref.current);
  const ajusta = useAjustaAlcada(ref, props.value);

  return (
    <textarea
      rows={FILES[mida]}
      {...props}
      ref={ref}
      className={['form__input', 'textarea-automatic', className].filter(Boolean).join(' ')}
      onInput={(e) => {
        ajusta();
        onInput?.(e);
      }}
    />
  );
});

export default TextareaAutomatic;
