import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ZonaPujada from './ZonaPujada';

const fitxer = (nom, tipus = 'image/jpeg') => new File(['x'], nom, { type: tipus });

const muntar = (props) => {
  const onFitxers = vi.fn();
  const { container } = render(
    <ZonaPujada
      id="zona-prova"
      etiqueta="Afegir imatges a la galeria"
      habilitada
      motiuDeshabilitada="Cal un slug per poder pujar imatges."
      multiple
      onFitxers={onFitxers}
      estats={[]}
      {...props}
    />,
  );
  return { onFitxers, zona: container.querySelector('.zona-pujada') };
};

describe('ZonaPujada', () => {
  it('deixar anar 2 fitxers els passa tots dos', () => {
    const { onFitxers, zona } = muntar();
    const fitxers = [fitxer('a.jpg'), fitxer('b.png', 'image/png')];
    fireEvent.drop(zona, { dataTransfer: { files: fitxers } });
    expect(onFitxers).toHaveBeenCalledTimes(1);
    expect(onFitxers).toHaveBeenCalledWith(fitxers);
  });

  it('amb una zona d\'un sol fitxer, deixar-ne anar 2 només passa el primer', () => {
    const { onFitxers, zona } = muntar({ multiple: false });
    const fitxers = [fitxer('a.jpg'), fitxer('b.jpg')];
    fireEvent.drop(zona, { dataTransfer: { files: fitxers } });
    expect(onFitxers).toHaveBeenCalledWith([fitxers[0]]);
  });

  it('el selector de fitxers també els passa', async () => {
    const { onFitxers } = muntar();
    const fitxers = [fitxer('a.jpg'), fitxer('b.jpg')];
    await userEvent.upload(screen.getByLabelText('Afegir imatges a la galeria'), fitxers);
    expect(onFitxers).toHaveBeenCalledWith(fitxers);
    expect(screen.getByLabelText('Afegir imatges a la galeria')).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
  });

  it('desactivada, deixar anar no fa res i se\'n veu el motiu', () => {
    const { onFitxers, zona } = muntar({ habilitada: false });
    fireEvent.drop(zona, { dataTransfer: { files: [fitxer('a.jpg')] } });
    expect(onFitxers).not.toHaveBeenCalled();
    expect(screen.getByText('Cal un slug per poder pujar imatges.')).toBeInTheDocument();
    expect(screen.getByLabelText('Afegir imatges a la galeria')).toBeDisabled();
    expect(screen.queryByText('JPG, PNG o WebP, fins a 10 MB cada una.')).not.toBeInTheDocument();
  });

  it('activada, mostra l\'ajuda de formats', () => {
    muntar();
    expect(screen.getByText('JPG, PNG o WebP, fins a 10 MB cada una.')).toBeInTheDocument();
    expect(screen.queryByText('Cal un slug per poder pujar imatges.')).not.toBeInTheDocument();
  });

  it('mentre s\'hi arrossega té la classe --activa, i la perd en sortir o deixar anar', () => {
    const { zona } = muntar();
    fireEvent.dragOver(zona, { dataTransfer: { files: [] } });
    expect(zona).toHaveClass('zona-pujada--activa');
    fireEvent.dragLeave(zona);
    expect(zona).not.toHaveClass('zona-pujada--activa');
    fireEvent.dragOver(zona, { dataTransfer: { files: [] } });
    fireEvent.drop(zona, { dataTransfer: { files: [] } });
    expect(zona).not.toHaveClass('zona-pujada--activa');
  });

  it('mostra l\'estat de cada fitxer; els errors amb role="alert"', () => {
    muntar({
      estats: [
        { nom: 'a.jpg', estat: 'pujant' },
        { nom: 'b.jpg', estat: 'ok' },
        { nom: 'c.gif', estat: 'error', missatge: 'La imatge ha de ser JPG, PNG o WebP.' },
      ],
    });
    expect(screen.getByRole('status')).toHaveTextContent('a.jpg: pujant…');
    expect(screen.getByRole('status')).toHaveTextContent('b.jpg: pujada');
    expect(screen.getByRole('alert')).toHaveTextContent('c.gif: La imatge ha de ser JPG, PNG o WebP.');
  });
});
