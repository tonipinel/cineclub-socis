import { createRef } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TextareaAutomatic from './TextareaAutomatic';

const original = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'scrollHeight');
let alcadaSimulada = 0;

function simulaScrollHeight(valor) {
  alcadaSimulada = valor;
  Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
    configurable: true,
    get: () => alcadaSimulada,
  });
}

afterEach(() => {
  if (original) Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', original);
  else delete HTMLTextAreaElement.prototype.scrollHeight;
});

describe('TextareaAutomatic', () => {
  it("ajusta l'alçada al scrollHeight en muntar i quan canvia el value", () => {
    simulaScrollHeight(400);
    const linies = Array.from({ length: 20 }, (_, i) => `línia ${i}`).join('\n');
    const { rerender } = render(<TextareaAutomatic aria-label="Sinopsi" value={linies} onChange={() => {}} />);
    expect(screen.getByLabelText('Sinopsi').style.height).toBe('400px');

    simulaScrollHeight(640);
    rerender(<TextareaAutomatic aria-label="Sinopsi" value={`${linies}\nmés text`} onChange={() => {}} />);
    expect(screen.getByLabelText('Sinopsi').style.height).toBe('640px');
  });

  it("ajusta l'alçada mentre s'escriu (input)", () => {
    simulaScrollHeight(100);
    render(<TextareaAutomatic aria-label="Nota" defaultValue="a" />);
    simulaScrollHeight(220);
    fireEvent.input(screen.getByLabelText('Nota'), { target: { value: 'a\nb\nc' } });
    expect(screen.getByLabelText('Nota').style.height).toBe('220px');
  });

  it('files mínimes segons mida i rows explícit', () => {
    const { rerender } = render(<TextareaAutomatic aria-label="Camp" mida="curt" />);
    expect(screen.getByLabelText('Camp')).toHaveAttribute('rows', '3');
    rerender(<TextareaAutomatic aria-label="Camp" mida="llarg" />);
    expect(screen.getByLabelText('Camp')).toHaveAttribute('rows', '8');
    rerender(<TextareaAutomatic aria-label="Camp" />);
    expect(screen.getByLabelText('Camp')).toHaveAttribute('rows', '8');
    rerender(<TextareaAutomatic aria-label="Camp" mida="curt" rows={5} />);
    expect(screen.getByLabelText('Camp')).toHaveAttribute('rows', '5');
  });

  it("torna a ajustar l'alçada en canviar la mida de la finestra", () => {
    simulaScrollHeight(150);
    render(<TextareaAutomatic aria-label="Camp" defaultValue="text" />);
    expect(screen.getByLabelText('Camp').style.height).toBe('150px');
    simulaScrollHeight(310);
    fireEvent(window, new Event('resize'));
    expect(screen.getByLabelText('Camp').style.height).toBe('310px');
  });

  it('reenvia el ref al textarea', () => {
    const ref = createRef();
    render(<TextareaAutomatic ref={ref} aria-label="Camp" />);
    expect(ref.current).toBe(screen.getByLabelText('Camp'));
    expect(ref.current.tagName).toBe('TEXTAREA');
  });

  it('passa id, aria-describedby, classes i onChange', async () => {
    const onChange = vi.fn();
    render(
      <>
        <p id="ajuda">Ajuda</p>
        <TextareaAutomatic id="sinopsi" aria-describedby="ajuda" className="extra" onChange={onChange} aria-label="Sinopsi" />
      </>,
    );
    const camp = screen.getByLabelText('Sinopsi');
    expect(camp).toHaveAttribute('id', 'sinopsi');
    expect(camp).toHaveAccessibleDescription('Ajuda');
    expect(camp).toHaveClass('form__input', 'textarea-automatic', 'extra');
    await userEvent.type(camp, 'x');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("no escriu cap alçada si scrollHeight és 0 i la desa quan es torna visible", async () => {
    const originalRO = globalThis.ResizeObserver;
    let callback;
    globalThis.ResizeObserver = class {
      constructor(cb) { callback = cb; }
      observe() {}
      disconnect() {}
    };
    try {
      simulaScrollHeight(0);
      render(<TextareaAutomatic aria-label="Camp" defaultValue="text" />);
      const camp = screen.getByLabelText('Camp');
      expect(camp.style.height).toBe('');
      simulaScrollHeight(260);
      callback([{ contentRect: { width: 300 } }]);
      await waitFor(() => expect(camp.style.height).toBe('260px'));
    } finally {
      globalThis.ResizeObserver = originalRO;
    }
  });

  it('suma el gruix de les vores a l\'alçada (border-box)', () => {
    simulaScrollHeight(200);
    const dOffset = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
    const dClient = Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight');
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 204 });
    Object.defineProperty(Element.prototype, 'clientHeight', { configurable: true, get: () => 200 });
    try {
      render(<TextareaAutomatic aria-label="Camp" defaultValue="text" />);
      expect(screen.getByLabelText('Camp').style.height).toBe('204px');
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', dOffset);
      Object.defineProperty(Element.prototype, 'clientHeight', dClient);
    }
  });
});
