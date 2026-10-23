import { describe, it, expect, beforeEach } from 'vitest';
import { campsSenseNom, nombreH1, ampladaEstandard } from './auditoria-a11y.js';

const pinta = (html) => { document.body.innerHTML = html; };

describe('campsSenseNom', () => {
  beforeEach(() => pinta(''));

  it('accepta aria-label, aria-labelledby, label associada i label que envolta', () => {
    pinta(`
      <input aria-label="Cerca">
      <span id="t">Títol</span><input aria-labelledby="t">
      <label for="a">Nom</label><input id="a">
      <label>Correu <input></label>
      <label>Tria <select><option>x</option></select></label>`);
    expect(campsSenseNom()).toEqual([]);
  });

  it('detecta camps sense nom, i no accepta title ni placeholder', () => {
    pinta('<input title="Cerca"><textarea placeholder="Notes"></textarea><select id="s"></select><label for="s"> </label>');
    expect(campsSenseNom()).toHaveLength(3);
  });

  it('ignora type=hidden i els camps amagats, però no el d\'un fitxer visualment ocult', () => {
    pinta(`<input type="hidden"><div hidden><input></div><input style="display:none">
      <input type="file" style="position:absolute;clip:rect(0,0,0,0)">`);
    expect(campsSenseNom()).toEqual(['input[type=file]']);
    pinta('<input type="file" id="f"><label for="f">Tria un fitxer</label>');
    expect(campsSenseNom()).toEqual([]);
  });
});

describe('nombreH1 i ampladaEstandard', () => {
  it('compta els h1 visibles', () => {
    pinta('<h1>A</h1><h1>B</h1><h1 style="display:none">C</h1>');
    expect(nombreH1()).toBe(2);
  });
  it('accepta les tres amplades ±2', () => {
    expect([1280, 1026, 1022, 768, 770].every(ampladaEstandard)).toBe(true);
    expect([1200, 1029, 1440].some(ampladaEstandard)).toBe(false);
  });
});
