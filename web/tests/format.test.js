import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  dataCa, dataCaCurta, dataCaCartell, dataCaHtml, dataCaCurtaHtml, dataCaCartellHtml, dataIso, urlize, horaNormal,
} from '../src/lib/format.js';

const dates = JSON.parse(readFileSync(new URL('./fixtures/hugo-dates.json', import.meta.url), 'utf8'));
const termes = JSON.parse(readFileSync(new URL('./fixtures/hugo-termes.json', import.meta.url), 'utf8'));

describe('urlize', () => {
  it.each([
    ['George A. Romero', 'george-a.-romero'],
    ["Judith O'Dea", 'judith-odea'],
    ['Alauda Ruiz de Azúa', 'alauda-ruiz-de-azúa'],
    ['Comèdia dramàtica', 'comèdia-dramàtica'],
    ['Època', 'època'],
  ])('%s -> %s', (entrada, esperat) => {
    expect(urlize(entrada)).toBe(esperat);
  });

  it('reprodueix cada carpeta de taxonomia generada per Hugo', () => {
    for (const camp of ['directors', 'generes', 'interprets']) {
      for (const { nom, carpeta } of termes[camp]) {
        expect(urlize(nom), `${camp}: ${nom}`).toBe(carpeta);
      }
    }
  });
});

// Hugo minifica el HTML i treu les cometes dels atributs; les plantilles les porten.
const sensePuntes = (html) => html.replace(/class="([^"]*)"/g, 'class=$1');

describe('dates en català (literals de Hugo, tres variants)', () => {
  it.each(dates)('$slug: dataCa (date-ca.html)', ({ data, hora, completa }) => {
    expect(sensePuntes(dataCaHtml(data, hora))).toBe(completa);
    const { principal, resta } = dataCa(data, hora);
    expect(`<span class=date-ca__main>${principal}</span><span class=date-ca__rest> ${resta}</span>`).toBe(completa);
  });

  it.each(dates)('$slug: dataCaCurta (date-ca-short.html)', ({ data, hora, curta }) => {
    expect(sensePuntes(dataCaCurtaHtml(data, hora))).toBe(curta);
    const { principal, resta } = dataCaCurta(data, hora);
    expect(`<span class=date-ca__main>${principal}</span><span class=date-ca__rest> ${resta}</span>`).toBe(curta);
  });

  it.each(dates)('$slug: dataCaCartell (date-ca-cartell.html)', ({ data, hora, cartell }) => {
    expect(sensePuntes(dataCaCartellHtml(data, hora))).toBe(cartell);
    const { data: dia, hora: h } = dataCaCartell(data, hora);
    expect(`<div class=cartell__date-line><span class=cartell__date>${dia}</span> <span class=cartell__date-time>${h}</span></div>`).toBe(cartell);
  });

  it.each(dates)('$slug: dataIso', ({ data, hora, iso }) => {
    expect(dataIso(data, hora)).toBe(iso);
  });

  it('retorna les parts separades, sense espais sobrants', () => {
    expect(dataCa('2026-10-08', '19:00')).toEqual({ principal: "Dijous 8 d'octubre", resta: '2026 - 19:00h' });
    expect(dataCaCurta('2026-10-08', '19:00')).toEqual({ principal: "Dijous 8 d'octubre", resta: '19:00h' });
    expect(dataCaCartell('2026-10-08', '19:00')).toEqual({ data: "Dijous 8 d'octubre", hora: 'a les 19:00h' });
  });
});

describe('horaNormal', () => {
  it('omple amb zero i rebutja el que no és una hora', () => {
    expect(horaNormal('9:30')).toBe('09:30');
    expect(horaNormal('19:00')).toBe('19:00');
    expect(horaNormal(' 9:05 ')).toBe('09:05');
    for (const dolent of ['24:00', '10:60', '930', '', null, undefined, 9, '9:3']) expect(horaNormal(dolent)).toBeNull();
  });
});
