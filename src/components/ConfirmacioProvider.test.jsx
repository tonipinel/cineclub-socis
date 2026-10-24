import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState } from 'react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { ConfirmacioProvider, useConfirmacio } from './ConfirmacioProvider';
import { GRACIA_ACCEPTAR_MS } from './DialegConfirmacio';

// Rellotge controlat: per defecte cada lectura de Date.now avança el període de gràcia,
// perquè els clics a «Accepta» de les proves no caiguin dins la gràcia d'obertura.
let ara;
let avanc;
beforeEach(() => {
  ara = 1_000_000;
  avanc = GRACIA_ACCEPTAR_MS;
  vi.spyOn(Date, 'now').mockImplementation(() => (ara += avanc));
});
afterEach(() => {
  vi.restoreAllMocks();
});

// Component de prova: cada botó obre una petició i n'apunta el resultat.
function Prova({ opcions = { missatge: 'Segur?' }, onResultat = () => {} }) {
  const { confirma, avisa } = useConfirmacio();
  const [resultats, setResultats] = useState([]);
  const apunta = (r) => {
    onResultat(r);
    setResultats((rs) => [...rs, r]);
  };
  return (
    <>
      <button type="button" onClick={() => confirma(opcions).then(apunta)}>Obrir</button>
      <button
        type="button"
        onClick={() => {
          confirma({ missatge: 'Primera?' }).then((r) => apunta(`primera:${r}`));
          confirma({ missatge: 'Segona?' }).then((r) => apunta(`segona:${r}`));
        }}
      >
        Dues
      </button>
      <button type="button" onClick={() => avisa({ missatge: 'Fet.' }).then((r) => apunta(`avis:${r}`))}>Avisar</button>
      <output>{resultats.join(',')}</output>
    </>
  );
}

function pinta(ui) {
  return render(<ConfirmacioProvider>{ui}</ConfirmacioProvider>);
}

const resultats = () => screen.getByRole('status').textContent;

function CapturaNavega({ navegaRef }) {
  const navigate = useNavigate();
  useEffect(() => {
    navegaRef.current = navigate;
  });
  return null;
}

// Renderitza dins d'un MemoryRouter i retorna una funció per navegar.
function pintaAmbRuta(ruta, onResultat) {
  const navegaRef = { current: null };
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <ConfirmacioProvider>
        <CapturaNavega navegaRef={navegaRef} />
        <Prova onResultat={onResultat} />
      </ConfirmacioProvider>
    </MemoryRouter>,
  );
  return (desti) => act(() => navegaRef.current(desti));
}

describe('ConfirmacioProvider (camí sense showModal, com a jsdom)', () => {
  it('confirma mostra el diàleg i «Accepta» resol true', async () => {
    const onResultat = vi.fn();
    pinta(<Prova onResultat={onResultat} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Obrir' }));
    const dialeg = screen.getByRole('dialog');
    expect(dialeg).toHaveAttribute('open');
    expect(dialeg).toHaveAttribute('aria-modal', 'true');
    expect(dialeg).toHaveTextContent('Segur?');
    await userEvent.click(screen.getByRole('button', { name: 'Accepta' }));
    await waitFor(() => expect(onResultat).toHaveBeenCalledTimes(1));
    expect(onResultat).toHaveBeenCalledWith(true);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('«Cancel·lar» resol false', async () => {
    const onResultat = vi.fn();
    pinta(<Prova onResultat={onResultat} />);
    await userEvent.click(screen.getByRole('button', { name: 'Obrir' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel·lar' }));
    await waitFor(() => expect(onResultat).toHaveBeenCalledTimes(1));
    expect(onResultat).toHaveBeenCalledWith(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('ESC resol false', async () => {
    const onResultat = vi.fn();
    pinta(<Prova onResultat={onResultat} />);
    await userEvent.click(screen.getByRole('button', { name: 'Obrir' }));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(onResultat).toHaveBeenCalledTimes(1));
    expect(onResultat).toHaveBeenCalledWith(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('el clic al fons resol false i un clic al contingut no tanca', async () => {
    const onResultat = vi.fn();
    pinta(<Prova onResultat={onResultat} />);
    await userEvent.click(screen.getByRole('button', { name: 'Obrir' }));
    await userEvent.click(screen.getByText('Segur?'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onResultat).toHaveBeenCalledTimes(0);
    await userEvent.click(screen.getByRole('dialog'));
    await waitFor(() => expect(onResultat).toHaveBeenCalledTimes(1));
    expect(onResultat).toHaveBeenCalledWith(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('el focus inicial és a «Cancel·lar» i en tancar torna al botó que l\'ha obert', async () => {
    pinta(<Prova />);
    const obrir = screen.getByRole('button', { name: 'Obrir' });
    await userEvent.click(obrir);
    expect(screen.getByRole('button', { name: 'Cancel·lar' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Accepta' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(obrir).toHaveFocus();
  });

  it('el Tab queda atrapat dins el diàleg', async () => {
    pinta(<Prova />);
    await userEvent.click(screen.getByRole('button', { name: 'Obrir' }));
    const cancellar = screen.getByRole('button', { name: 'Cancel·lar' });
    const acceptar = screen.getByRole('button', { name: 'Accepta' });
    await userEvent.tab();
    expect(acceptar).toHaveFocus();
    await userEvent.tab();
    expect(cancellar).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(acceptar).toHaveFocus();
  });

  it('un doble clic a «Accepta» resol una sola vegada i no toca la petició següent', async () => {
    const onResultat = vi.fn();
    pinta(<Prova onResultat={onResultat} />);
    await userEvent.click(screen.getByRole('button', { name: 'Dues' }));
    await userEvent.dblClick(screen.getByRole('button', { name: 'Accepta' }));
    await waitFor(() => expect(onResultat).toHaveBeenCalledTimes(1));
    expect(onResultat).toHaveBeenCalledWith('primera:true');
    // La segona continua oberta, pendent de resposta.
    expect(screen.getByRole('dialog')).toHaveTextContent('Segona?');
    expect(resultats()).toBe('primera:true');
  });

  it('dos clics a «Accepta» abans que React torni a pintar resolen una sola vegada', async () => {
    const onResultat = vi.fn();
    pinta(<Prova onResultat={onResultat} />);
    await userEvent.click(screen.getByRole('button', { name: 'Dues' }));
    const acceptar = screen.getByRole('button', { name: 'Accepta' });
    act(() => {
      acceptar.click();
      acceptar.click();
    });
    await waitFor(() => expect(onResultat).toHaveBeenCalledTimes(1));
    expect(onResultat).toHaveBeenCalledWith('primera:true');
    expect(screen.getByRole('dialog')).toHaveTextContent('Segona?');
    expect(resultats()).toBe('primera:true');
  });

  it('perill: true aplica btn--perill al botó d\'acceptar', async () => {
    pinta(<Prova opcions={{ missatge: 'Eliminar?', perill: true, etiquetaAcceptar: 'Eliminar' }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Obrir' }));
    expect(screen.getByRole('button', { name: 'Eliminar' }).className).toBe('btn btn--perill');
    expect(screen.getByRole('button', { name: 'Cancel·lar' }).className).toBe('btn btn--outline');
  });

  it('sense perill el botó d\'acceptar és un btn normal', async () => {
    pinta(<Prova />);
    await userEvent.click(screen.getByRole('button', { name: 'Obrir' }));
    expect(screen.getByRole('button', { name: 'Accepta' }).className).toBe('btn');
  });

  it('avisa mostra un únic botó «Entesos» i resol en tancar-se', async () => {
    pinta(<Prova />);
    const obrir = screen.getByRole('button', { name: 'Avisar' });
    await userEvent.click(obrir);
    const dialeg = screen.getByRole('dialog');
    const botons = Array.from(dialeg.querySelectorAll('button'));
    expect(botons.map((b) => b.textContent)).toEqual(['Entesos']);
    expect(botons[0]).toHaveFocus();
    await userEvent.click(botons[0]);
    await waitFor(() => expect(resultats()).toBe('avis:undefined'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(obrir).toHaveFocus();
  });

  it('dues crides seguides es resolen en ordre: la segona s\'obre en tancar la primera', async () => {
    pinta(<Prova />);
    const dues = screen.getByRole('button', { name: 'Dues' });
    await userEvent.click(dues);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog')).toHaveTextContent('Primera?');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel·lar' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('Segona?'));
    expect(screen.getByRole('button', { name: 'Cancel·lar' })).toHaveFocus();
    expect(resultats()).toBe('primera:false');
    await userEvent.click(screen.getByRole('button', { name: 'Accepta' }));
    await waitFor(() => expect(resultats()).toBe('primera:false,segona:true'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(dues).toHaveFocus();
  });

  it('dins d\'un <form> el diàleg no envia el formulari', async () => {
    const onSubmit = vi.fn((e) => e.preventDefault());
    const onResultat = vi.fn();
    pinta(
      <form onSubmit={onSubmit}>
        <Prova onResultat={onResultat} />
      </form>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Obrir' }));
    const acceptar = screen.getByRole('button', { name: 'Accepta' });
    const cancellar = screen.getByRole('button', { name: 'Cancel·lar' });
    expect(acceptar).toHaveAttribute('type', 'button');
    expect(cancellar).toHaveAttribute('type', 'button');
    await userEvent.click(acceptar);
    await waitFor(() => expect(onResultat).toHaveBeenCalledWith(true));
    expect(onSubmit).toHaveBeenCalledTimes(0);
  });

  it('el segon clic d\'un doble clic (detail 2) no accepta el diàleg següent de la cua', async () => {
    pinta(<Prova />);
    await userEvent.click(screen.getByRole('button', { name: 'Dues' }));
    await userEvent.click(screen.getByRole('button', { name: 'Accepta' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('Segona?'));
    fireEvent.click(screen.getByRole('button', { name: 'Accepta' }), { detail: 2 });
    expect(screen.getByRole('dialog')).toHaveTextContent('Segona?');
    expect(resultats()).toBe('primera:true');
    await userEvent.click(screen.getByRole('button', { name: 'Accepta' }));
    await waitFor(() => expect(resultats()).toBe('primera:true,segona:true'));
  });

  it('«Accepta» no fa res durant el període de gràcia després d\'obrir-se', async () => {
    const onResultat = vi.fn();
    pinta(<Prova onResultat={onResultat} />);
    avanc = 0;
    await userEvent.click(screen.getByRole('button', { name: 'Obrir' }));
    const acceptar = screen.getByRole('button', { name: 'Accepta' });
    await userEvent.click(acceptar);
    ara += GRACIA_ACCEPTAR_MS - 1;
    await userEvent.click(acceptar);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onResultat).toHaveBeenCalledTimes(0);
    ara += 1;
    await userEvent.click(acceptar);
    await waitFor(() => expect(onResultat).toHaveBeenCalledTimes(1));
    expect(onResultat).toHaveBeenCalledWith(true);
  });

  it('«Cancel·lar» funciona fins i tot dins del període de gràcia', async () => {
    const onResultat = vi.fn();
    pinta(<Prova onResultat={onResultat} />);
    avanc = 0;
    await userEvent.click(screen.getByRole('button', { name: 'Obrir' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel·lar' }));
    await waitFor(() => expect(onResultat).toHaveBeenCalledTimes(1));
    expect(onResultat).toHaveBeenCalledWith(false);
  });

  describe('acció secundària', () => {
    const opcions = {
      missatge: 'Actualitzar?',
      etiquetaAcceptar: 'Conserva',
      accioSecundaria: { etiqueta: 'Sobreescriu', perill: true },
    };

    it('mostra Cancel·lar, l\'acció principal i la secundària (amb perill), en aquest ordre', async () => {
      pinta(<Prova opcions={opcions} />);
      await userEvent.click(screen.getByRole('button', { name: 'Obrir' }));
      const dialeg = screen.getByRole('alertdialog', { name: 'Actualitzar?' });
      const botons = Array.from(dialeg.querySelectorAll('button'));
      expect(botons.map((b) => b.textContent)).toEqual(['Cancel·lar', 'Conserva', 'Sobreescriu']);
      expect(botons.map((b) => b.className)).toEqual(['btn btn--outline', 'btn', 'btn btn--perill']);
      expect(botons[0]).toHaveFocus();
    });

    it('la secundària resol «secundaria»; la principal, true; Cancel·lar i ESC, false', async () => {
      const onResultat = vi.fn();
      pinta(<Prova opcions={opcions} onResultat={onResultat} />);
      const obrir = screen.getByRole('button', { name: 'Obrir' });
      await userEvent.click(obrir);
      await userEvent.click(screen.getByRole('button', { name: 'Sobreescriu' }));
      await waitFor(() => expect(onResultat).toHaveBeenLastCalledWith('secundaria'));
      await userEvent.click(obrir);
      await userEvent.click(screen.getByRole('button', { name: 'Conserva' }));
      await waitFor(() => expect(onResultat).toHaveBeenLastCalledWith(true));
      await userEvent.click(obrir);
      await userEvent.click(screen.getByRole('button', { name: 'Cancel·lar' }));
      await waitFor(() => expect(onResultat).toHaveBeenLastCalledWith(false));
      await userEvent.click(obrir);
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(onResultat).toHaveBeenCalledTimes(4));
      expect(onResultat).toHaveBeenLastCalledWith(false);
    });

    it('la secundària tampoc no fa res durant el període de gràcia ni amb el segon clic d\'un doble clic', async () => {
      const onResultat = vi.fn();
      pinta(<Prova opcions={opcions} onResultat={onResultat} />);
      avanc = 0;
      await userEvent.click(screen.getByRole('button', { name: 'Obrir' }));
      const secundaria = screen.getByRole('button', { name: 'Sobreescriu' });
      await userEvent.click(secundaria);
      ara += GRACIA_ACCEPTAR_MS;
      fireEvent.click(secundaria, { detail: 2 });
      expect(onResultat).not.toHaveBeenCalled();
      await userEvent.click(secundaria);
      await waitFor(() => expect(onResultat).toHaveBeenCalledWith('secundaria'));
    });

    it('amb acció secundària, els botons van apilats; sense, la fila de sempre', async () => {
      pinta(<Prova opcions={opcions} />);
      await userEvent.click(screen.getByRole('button', { name: 'Obrir' }));
      expect(screen.getByRole('button', { name: 'Conserva' }).parentElement)
        .toHaveClass('dialeg-confirmacio__accions', 'dialeg-confirmacio__accions--apilades');
      await userEvent.click(screen.getByRole('button', { name: 'Cancel·lar' }));
      await userEvent.click(screen.getByRole('button', { name: 'Avisar' }));
      expect(screen.getByRole('button', { name: 'Entesos' }).parentElement.className).toBe('dialeg-confirmacio__accions');
    });

    it('sense perill a cap acció, el diàleg és un dialog normal', async () => {
      pinta(<Prova opcions={{ missatge: 'Tria', accioSecundaria: { etiqueta: 'Altra' } }} />);
      await userEvent.click(screen.getByRole('button', { name: 'Obrir' }));
      expect(screen.getByRole('dialog', { name: 'Tria' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Altra' }).className).toBe('btn');
    });
  });

  it('perill: true fa servir role="alertdialog" amb aria-modal', async () => {
    pinta(<Prova opcions={{ missatge: 'Eliminar?', perill: true }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Obrir' }));
    expect(screen.getByRole('alertdialog', { name: 'Eliminar?' })).toHaveAttribute('aria-modal', 'true');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('en desmuntar el provider, les peticions pendents es resolen amb false', async () => {
    const onResultat = vi.fn();
    const { unmount } = pinta(<Prova onResultat={onResultat} />);
    await userEvent.click(screen.getByRole('button', { name: 'Dues' }));
    unmount();
    await waitFor(() => expect(onResultat).toHaveBeenCalledTimes(2));
    expect(onResultat.mock.calls).toEqual([['primera:false'], ['segona:false']]);
  });

  it('en canviar de ruta, l\'oberta i les de la cua es resolen amb false i el diàleg desapareix', async () => {
    const onResultat = vi.fn();
    const navega = pintaAmbRuta('/entitats/e1', onResultat);
    await userEvent.click(screen.getByRole('button', { name: 'Obrir' }));
    await userEvent.click(screen.getByRole('button', { name: 'Dues' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Segur?');
    navega('/entitats');
    await waitFor(() => expect(onResultat).toHaveBeenCalledTimes(3));
    expect(onResultat.mock.calls).toEqual([[false], ['primera:false'], ['segona:false']]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('una petició ja resolta no es torna a resoldre en canviar de ruta', async () => {
    const onResultat = vi.fn();
    const navega = pintaAmbRuta('/a', onResultat);
    await userEvent.click(screen.getByRole('button', { name: 'Dues' }));
    await userEvent.click(screen.getByRole('button', { name: 'Accepta' }));
    await waitFor(() => expect(onResultat).toHaveBeenCalledTimes(1));
    navega('/b');
    await waitFor(() => expect(onResultat).toHaveBeenCalledTimes(2));
    expect(onResultat.mock.calls).toEqual([['primera:true'], ['segona:false']]);
    navega('/c');
    expect(onResultat).toHaveBeenCalledTimes(2);
  });

  it('canviar només la query no tanca el diàleg', async () => {
    const onResultat = vi.fn();
    const navega = pintaAmbRuta('/sessions/s1', onResultat);
    await userEvent.click(screen.getByRole('button', { name: 'Obrir' }));
    navega('/sessions/s1?pestanya=dades');
    expect(screen.getByRole('dialog')).toHaveTextContent('Segur?');
    expect(onResultat).toHaveBeenCalledTimes(0);
  });

  it('useConfirmacio fora del provider llança un error clar', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Prova />)).toThrow(new Error("useConfirmacio s'ha d'usar dins de ConfirmacioProvider"));
  });
});

describe('ConfirmacioProvider (camí amb showModal natiu)', () => {
  const original = {
    showModal: HTMLDialogElement.prototype.showModal,
    close: HTMLDialogElement.prototype.close,
  };
  const showModal = vi.fn(function () { this.setAttribute('open', ''); });
  const close = vi.fn(function () { this.removeAttribute('open'); });

  function installa() {
    showModal.mockClear();
    close.mockClear();
    HTMLDialogElement.prototype.showModal = showModal;
    HTMLDialogElement.prototype.close = close;
  }

  afterEach(() => {
    // Desmunta abans de restaurar el prototip: el diàleg obert crida close() en desmuntar-se.
    cleanup();
    HTMLDialogElement.prototype.showModal = original.showModal;
    HTMLDialogElement.prototype.close = original.close;
  });

  it('perill: true fa servir role="alertdialog" també amb el modal natiu', async () => {
    installa();
    pinta(<Prova opcions={{ missatge: 'Eliminar?', perill: true }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Obrir' }));
    const dialeg = screen.getByRole('alertdialog', { name: 'Eliminar?' });
    expect(dialeg.tagName).toBe('DIALOG');
    expect(dialeg).not.toHaveAttribute('aria-modal');
  });

  it('obre amb showModal, sense role ni aria-modal explícits, i «Accepta» resol true', async () => {
    installa();
    const onResultat = vi.fn();
    pinta(<Prova onResultat={onResultat} />);
    await userEvent.click(screen.getByRole('button', { name: 'Obrir' }));
    expect(showModal).toHaveBeenCalledTimes(1);
    const dialeg = screen.getByRole('dialog');
    expect(dialeg.tagName).toBe('DIALOG');
    expect(dialeg).not.toHaveAttribute('role');
    expect(dialeg).not.toHaveAttribute('aria-modal');
    expect(screen.getByRole('button', { name: 'Cancel·lar' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Accepta' }));
    await waitFor(() => expect(onResultat).toHaveBeenCalledTimes(1));
    expect(onResultat).toHaveBeenCalledWith(true);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('l\'esdeveniment cancel (ESC) resol false i evita que el navegador tanqui el diàleg pel seu compte', async () => {
    installa();
    const onResultat = vi.fn();
    pinta(<Prova onResultat={onResultat} />);
    const obrir = screen.getByRole('button', { name: 'Obrir' });
    await userEvent.click(obrir);
    const cancel = new Event('cancel', { cancelable: true });
    fireEvent(screen.getByRole('dialog'), cancel);
    expect(cancel.defaultPrevented).toBe(true);
    await waitFor(() => expect(onResultat).toHaveBeenCalledTimes(1));
    expect(onResultat).toHaveBeenCalledWith(false);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(obrir).toHaveFocus();
  });

  it('si el navegador el tanca igualment (close), resol false una sola vegada', async () => {
    installa();
    const onResultat = vi.fn();
    pinta(<Prova onResultat={onResultat} />);
    await userEvent.click(screen.getByRole('button', { name: 'Obrir' }));
    const dialeg = screen.getByRole('dialog');
    fireEvent(dialeg, new Event('cancel'));
    fireEvent(dialeg, new Event('close'));
    await waitFor(() => expect(onResultat).toHaveBeenCalledTimes(1));
    expect(onResultat).toHaveBeenCalledWith(false);
  });

  it('el clic al fons (el mateix <dialog>) resol false', async () => {
    installa();
    const onResultat = vi.fn();
    pinta(<Prova onResultat={onResultat} />);
    await userEvent.click(screen.getByRole('button', { name: 'Obrir' }));
    await userEvent.click(screen.getByRole('dialog'));
    await waitFor(() => expect(onResultat).toHaveBeenCalledTimes(1));
    expect(onResultat).toHaveBeenCalledWith(false);
  });
});
