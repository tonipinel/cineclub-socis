import {
  DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { arrossegamentDisponible, reordenar } from '../../../lib/pujadaImatges';

// L'id de cada ítem és la seva URL (única gràcies a `afegirUrls`); els anuncis diuen la posició 1-based.
const anuncis = (galeria) => {
  const n = (id) => galeria.indexOf(id) + 1;
  return {
    onDragStart: ({ active }) => `Has agafat la imatge ${n(active.id)}.`,
    onDragOver: ({ active, over }) => (over ? `Imatge ${n(active.id)} a la posició ${n(over.id)}.` : undefined),
    onDragEnd: ({ active, over }) => (over ? `Imatge ${n(active.id)} deixada a la posició ${n(over.id)}.` : undefined),
    onDragCancel: () => 'Arrossegament cancel·lat.',
  };
};

const INSTRUCCIONS = {
  draggable: 'Per reordenar, prem Espai o Retorn, mou la imatge amb les fletxes i torna a prémer Espai o Retorn per deixar-la. Escapada cancel·la.',
};

function Element({ url, i, total, cartell, arrossegament, onMoure, onTreure, onFerCartell }) {
  const {
    attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging,
  } = useSortable({ id: url, disabled: !arrossegament });
  const n = i + 1;
  const estil = { transform: CSS.Transform.toString(transform), transition };
  return (
    <li
      ref={setNodeRef}
      style={estil}
      className={isDragging ? 'galeria-imatges__element galeria-imatges__element--arrossegant' : 'galeria-imatges__element'}
    >
      <img className="galeria-imatges__miniatura" src={url} alt={`Imatge ${n} de la galeria`} />
      <div className="galeria-imatges__accions">
        {arrossegament ? (
          <button
            type="button"
            ref={setActivatorNodeRef}
            className="btn-icona galeria-imatges__handle"
            {...attributes}
            {...listeners}
            aria-label={`Arrossega per reordenar la imatge ${n}`}
          >
            ⠿
          </button>
        ) : (
          <>
            <button type="button" className="btn-icona" aria-label={`Moure amunt la imatge ${n}`} disabled={i === 0} onClick={() => onMoure(i, i - 1)}>↑</button>
            <button type="button" className="btn-icona" aria-label={`Moure avall la imatge ${n}`} disabled={i === total - 1} onClick={() => onMoure(i, i + 1)}>↓</button>
          </>
        )}
        <button
          type="button"
          className="btn-icona galeria-imatges__cartell"
          aria-label={`Fer cartell la imatge ${n}`}
          title="Fer cartell"
          disabled={cartell === url}
          onClick={() => onFerCartell(url)}
        >
          ★
        </button>
        <button type="button" className="btn-icona" aria-label={`Treure la imatge ${n}`} title="Treure" onClick={() => onTreure(i)}>✕</button>
      </div>
    </li>
  );
}

export default function GaleriaImatges({
  galeria, cartell, onCanviGaleria, onFerCartell, arrossegament = arrossegamentDisponible(),
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    onCanviGaleria(reordenar(galeria, galeria.indexOf(active.id), galeria.indexOf(over.id)));
  };

  if (galeria.length === 0) return <p className="form__ajuda">La galeria és buida.</p>;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{ announcements: anuncis(galeria), screenReaderInstructions: INSTRUCCIONS }}
    >
      <SortableContext items={galeria} strategy={rectSortingStrategy}>
        <ul className="galeria-imatges" aria-label="Galeria">
          {galeria.map((url, i) => (
            <Element
              key={url}
              url={url}
              i={i}
              total={galeria.length}
              cartell={cartell}
              arrossegament={arrossegament}
              onMoure={(de, a) => onCanviGaleria(reordenar(galeria, de, a))}
              onTreure={(j) => onCanviGaleria(galeria.filter((_, k) => k !== j))}
              onFerCartell={onFerCartell}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
