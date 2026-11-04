import { describe, expect, it } from 'vitest';
import { MIDES_MM, pagines } from './comprova-pdf-flyer.mjs';

const pdf = (...mides) => `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Count ${mides.length} /Kids [${mides.map((_, i) => `${i + 3} 0 R`).join(' ')}] >>
endobj
${mides.map((m, i) => `${i + 3} 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${m[0]} ${m[1]}] /Contents 9 0 R >>
endobj`).join('\n')}
%%EOF`;

describe('MIDES_MM', () => {
  it('simple és una tira de 210 × 99 mm per pàgina; impremta, 216 × 303 mm', () => {
    expect(MIDES_MM).toEqual({ simple: [210, 99], impremta: [216, 303] });
  });
});

describe('pagines', () => {
  it('llegeix el nombre de pàgines i la mida en mm (A4 i 216 × 303)', () => {
    const mm = (pt) => pt * 25.4 / 72;
    const llista = pagines(Buffer.from(pdf([595.276, 841.89], [612.283, 858.898])));
    expect(llista).toHaveLength(2);
    expect(llista[0].ample_mm).toBeCloseTo(210, 0);
    expect(llista[0].alt_mm).toBeCloseTo(297, 0);
    expect(llista[1].ample_mm).toBeCloseTo(mm(612.283), 3);
    expect(llista[1].ample_mm).toBeCloseTo(216, 0);
    expect(llista[1].alt_mm).toBeCloseTo(303, 0);
  });

  it("no compta l'arbre /Pages com a pàgina", () => {
    expect(pagines(Buffer.from(pdf([595, 842])))).toHaveLength(1);
  });
});
