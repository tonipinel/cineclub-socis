import { describe, it, expect } from 'vitest';
import solicituds from './solicituds.js';

const {
  escaparHtml, textPla, correuValid, nomValid, crearCorreuUnCop, gestionarNovaSolicitud, LIMIT_BENVINGUDES_HORA,
  LIMIT_AVISOS_DIA,
} = solicituds;

// Imita la col·lecció `mail`: `create()` falla amb ALREADY_EXISTS (codi 6) si l'id ja hi és.
function mailFals(registre = []) {
  const docs = new Map();
  return {
    docs,
    registre,
    doc: (id) => ({
      create: async (dades) => {
        if (docs.has(id)) throw Object.assign(new Error('6 ALREADY_EXISTS: Document already exists'), { code: 6 });
        docs.set(id, dades);
        registre.push(dades);
      },
    }),
  };
}

// Correus que generava la versió anterior per a una sol·licitud normal (abans d'escapar res): una
// sol·licitud legítima ha de continuar rebent exactament el mateix text.
const ABANS = {
  admin: "\n    <p>S'ha rebut una nova sol·licitud d'alta de soci/a.</p>\n    <table cellpadding=\"4\"><tr><td><strong>Nom</strong></td><td>Anna</td></tr><tr><td><strong>Cognoms</strong></td><td>Vidal</td></tr><tr><td><strong>DNI</strong></td><td>12345678Z</td></tr><tr><td><strong>Població</strong></td><td>Roda de Berà</td></tr><tr><td><strong>Codi postal</strong></td><td>43883</td></tr><tr><td><strong>Telèfon</strong></td><td>600000000</td></tr><tr><td><strong>Correu electrònic</strong></td><td>anna@example.com</td></tr><tr><td><strong>Comentaris</strong></td><td>Hola!</td></tr></table>\n    <p><a href=\"https://associacio.cineclubrodadebera.cat/solicituds\">Veure les sol·licituds pendents</a></p>\n  \n    <p style=\"margin-top:24px;\">\n      <img src=\"https://cineclubrodadebera.cat/images/logo.png\" alt=\"Cineclub Roda de Berà\" width=\"80\" style=\"display:block;margin-bottom:8px;\">\n      <strong>Associació Cineclub Roda de Berà</strong>\n    </p>\n  ",
  benvinguda: "\n    <p>Hola Anna,</p>\n    <p>Moltes gràcies per haver omplert el formulari per formar part del Cineclub Roda de Berà. Ens fa molta il·lusió veure l'interès que està generant el projecte.</p>\n    <p>T'informem del nostre compte bancari de l'associació per si vols tramitar el pagament de la quota anual (30€): ES12 3456 7890 1234 5678 9012.</p>\n    <p>Si ho prefereixes, també pots pagar en efectiu o targeta en la propera sessió o algun dimecres en el nostre horari d'oficina a l'Hotel d'Entitats, que és de 15.15 a 16.15 hores (en aquest últim cas, consulta'ns abans perquè algun dimecres potser no hi som).</p>\n    <p>Per avançar feina i que no et perdis cap informació mentrestant, t'afegirem al grup de whatsapp de socis i sòcies, allà és on centralitzem tota la informació i on generem les enquestes per triar les properes sessions.</p>\n    <p>Gràcies per la confiança i per ajudar-nos a posar en marxa aquest espai de cinema a Roda de Berà.</p>\n    <p>Si tens qualsevol dubte, comentari o suggeriment, estem a la teva disposició.</p>\n    <p>Salut i cinema!</p>\n  \n    <p style=\"margin-top:24px;\">\n      <img src=\"https://cineclubrodadebera.cat/images/logo.png\" alt=\"Cineclub Roda de Berà\" width=\"80\" style=\"display:block;margin-bottom:8px;\">\n      <strong>Associació Cineclub Roda de Berà</strong>\n    </p>\n  ",
};

const ARA = Date.parse('2026-10-24T10:00:00Z');
const timestamp = (ms) => ({ toMillis: () => ms });
const CONFIG = { quotaAnual: 30, numeroCompte: 'ES12 3456 7890 1234 5678 9012' };

function solicitud(canvis = {}) {
  return {
    nom: 'Anna', cognoms: 'Vidal', dni: '12345678Z', poblacio: 'Roda de Berà', codiPostal: '43883',
    telefon: '600000000', correuElectronic: 'anna@example.com', comentaris: 'Hola!',
    acceptaPrivacitat: true, acceptaDadesPersonals: true, estat: 'pendent', timestamp: timestamp(ARA),
    ...canvis,
  };
}

// `altres`: sol·licituds ja desades ({ id, correuElectronic, ms }); `recents`: quantes se n'han creat
// (aquesta inclosa) en l'última hora i en les últimes 24 hores.
function entorn({ altres = [], recentsHora = 1, recentsDia = 1 } = {}) {
  const mail = mailFals();
  const avisos = [];
  const consultes = [];
  const deps = {
    obtenirConfiguracio: async () => CONFIG,
    mail,
    comptarDesDe: async (data) => (ARA - data.getTime() <= 60 * 60 * 1000 ? recentsHora : recentsDia),
    solicitudsAmbCorreu: async (variants) => {
      consultes.push(variants);
      return [{ id: 'sol-1', ms: ARA }, ...altres]
        .filter((s) => variants.includes(s.correuElectronic ?? 'anna@example.com'))
        .map(({ id, ms }) => ({ id, ms }));
    },
    avisar: (...args) => avisos.push(args),
  };
  return {
    deps, avisos, consultes, ids: () => [...mail.docs.keys()],
    correus: mail.registre,
  };
}

const html = (correu) => correu.message.html;

describe('escaparHtml', () => {
  it('escapa els caràcters especials d\'HTML i les cometes', () => {
    expect(escaparHtml('<script>alert("x")</script> & \'y\''))
      .toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;');
  });

  it('treu els salts de línia', () => {
    expect(escaparHtml('a\r\nb\nc\rd')).toBe('a b c d');
  });

  it('no mostra valors que no són text', () => {
    expect(escaparHtml(['a@x.com', 'b@y.com'])).toBe('[valor no vàlid]');
    expect(escaparHtml({ a: 1 })).toBe('[valor no vàlid]');
    expect(escaparHtml(30)).toBe('30');
  });
});

describe('textPla', () => {
  it('treu salts de línia i caràcters de control però no escapa', () => {
    expect(textPla('D\'Amico\r\nBcc: x@y.com\u0000')).toBe('D\'Amico Bcc: x@y.com');
    expect(textPla(['x'])).toBe('');
  });
});

describe('correuValid', () => {
  it('accepta un únic correu normal', () => {
    expect(correuValid('anna@example.com')).toBe(true);
    expect(correuValid('anna.vidal+cine@correu.example.cat')).toBe(true);
  });

  it('rebutja llistes, objectes, textos llargs i formats estranys', () => {
    expect(correuValid(['anna@example.com'])).toBe(false);
    expect(correuValid({ to: 'anna@example.com' })).toBe(false);
    expect(correuValid('')).toBe(false);
    expect(correuValid('a@example.com, b@example.com')).toBe(false);
    expect(correuValid('a@example.com,b@example.com')).toBe(false);
    expect(correuValid('Nom <a@example.com>')).toBe(false);
    expect(correuValid('a@example.com\nBcc: b@example.com')).toBe(false);
    expect(correuValid('no-es-un-correu')).toBe(false);
    expect(correuValid(`${'a'.repeat(250)}@example.com`)).toBe(false);
  });
});

describe('nomValid', () => {
  it('accepta noms normals', () => {
    for (const nom of ['Anna', 'D\'Amico', 'D’Amico', 'Maria-José', 'Joan Carles', 'M. Àngels', ' Núria ']) {
      expect(nomValid(nom), nom).toBe(true);
    }
  });

  it('rebutja textos que no semblen un nom', () => {
    for (const nom of ['el compte ha canviat, paga a ES91 2100 0000', 'evil.com', 'Anna http://x', 'a@b.cat',
      'Anna: urgent', 'a\\b', '1234', '', 'a'.repeat(41), ['Anna'], '<b>Anna</b>']) {
      expect(nomValid(nom), String(nom)).toBe(false);
    }
  });
});

describe('crearCorreuUnCop', () => {
  it('crea el document amb l\'id donat i no falla si ja existeix', async () => {
    const mail = mailFals();
    await crearCorreuUnCop(mail, 'x', { a: 1 });
    await crearCorreuUnCop(mail, 'x', { a: 2 });
    expect([...mail.docs.entries()]).toEqual([['x', { a: 1 }]]);
  });

  it('accepta l\'error ALREADY_EXISTS pel missatge encara que no porti codi', async () => {
    const mail = { doc: () => ({ create: async () => { throw new Error('Document already exists: mail/x'); } }) };
    await expect(crearCorreuUnCop(mail, 'x', {})).resolves.toBeUndefined();
  });

  it('deixa passar qualsevol altre error', async () => {
    const mail = { doc: () => ({ create: async () => { throw Object.assign(new Error('UNAVAILABLE'), { code: 14 }); } }) };
    await expect(crearCorreuUnCop(mail, 'x', {})).rejects.toThrow('UNAVAILABLE');
  });
});

describe('gestionarNovaSolicitud', () => {
  it('desa els correus amb ids fixos i, si el disparador es repeteix, no n\'envia cap de nou', async () => {
    const e = entorn();
    await gestionarNovaSolicitud(e.deps, 'sol-1', solicitud(), ARA);
    await gestionarNovaSolicitud(e.deps, 'sol-1', solicitud(), ARA);
    expect(e.ids()).toEqual(['solicitud-sol-1-admin', 'solicitud-sol-1-benvinguda']);
  });

  it('un error en desar el correu (que no sigui ALREADY_EXISTS) es propaga', async () => {
    const e = entorn();
    e.deps.mail = { doc: () => ({ create: async () => { throw Object.assign(new Error('UNAVAILABLE'), { code: 14 }); } }) };
    await expect(gestionarNovaSolicitud(e.deps, 'sol-1', solicitud(), ARA)).rejects.toThrow('UNAVAILABLE');
  });

  it('amb un nom que no és un nom no envia la benvinguda però avisa el club', async () => {
    for (const nom of ['el compte ha canviat, paga a ES91 2100 0000', 'evil.com', 'Anna http://x', 'a@b.cat']) {
      const e = entorn();
      await gestionarNovaSolicitud(e.deps, 'sol-1', solicitud({ nom }), ARA);
      expect(e.correus.map((c) => c.to), nom).toEqual(['cineclub.rodadebera@gmail.com']);
      expect(html(e.correus[0])).toContain('No s\'ha enviat el correu de benvinguda: nom no vàlid per a la benvinguda.');
      expect(e.avisos[0][1]).toEqual({ id: 'sol-1', motiu: 'nom-no-valid' });
    }
  });

  it('noms amb apòstrof, guionet o dues paraules sí que reben la benvinguda', async () => {
    for (const nom of ['D\'Amico', 'Maria-José', 'Joan Carles']) {
      const e = entorn();
      await gestionarNovaSolicitud(e.deps, 'sol-1', solicitud({ nom }), ARA);
      expect(e.correus.map((c) => c.to), nom).toEqual(['cineclub.rodadebera@gmail.com', 'anna@example.com']);
    }
  });

  it('una sol·licitud normal envia els mateixos dos correus que abans', async () => {
    const { deps, correus, avisos } = entorn();
    await gestionarNovaSolicitud(deps, 'sol-1', solicitud(), ARA);
    expect(correus).toEqual([
      {
        to: 'cineclub.rodadebera@gmail.com',
        from: 'cineclub.rodadebera@gmail.com',
        message: { subject: 'Nova sol·licitud d\'alta: Anna Vidal', html: ABANS.admin },
      },
      {
        to: 'anna@example.com',
        from: 'cineclub.rodadebera@gmail.com',
        message: { subject: 'Benvingut/da al Cineclub Roda de Berà', html: ABANS.benvinguda },
      },
    ]);
    expect(avisos).toEqual([]);
  });

  it('sense correu només avisa el club, com abans', async () => {
    const { deps, correus, avisos } = entorn();
    await gestionarNovaSolicitud(deps, 'sol-1', solicitud({ correuElectronic: '' }), ARA);
    expect(correus).toHaveLength(1);
    expect(correus[0].to).toBe('cineclub.rodadebera@gmail.com');
    expect(html(correus[0])).not.toContain('benvinguda');
    expect(avisos).toEqual([]);
  });

  it('escapa tots els camps als dos correus i neteja l\'assumpte', async () => {
    const { deps, correus } = entorn();
    await gestionarNovaSolicitud(deps, 'sol-1', solicitud({
      nom: '<script>alert(1)</script>',
      cognoms: '"Vidal"\r\nBcc: x@evil.com',
      comentaris: '<a href="https://evil">Paga aquí</a>\nsegona línia',
    }), ARA);
    // Amb aquest nom no hi ha benvinguda (nom no vàlid): només el correu al club, escapat.
    expect(correus).toHaveLength(1);
    const [admin] = correus;
    expect(admin.message.subject).toBe('Nova sol·licitud d\'alta: <script>alert(1)</script> "Vidal" Bcc: x@evil.com');
    expect(html(admin)).not.toContain('<script>');
    expect(html(admin)).not.toContain('href="https://evil"');
    expect(html(admin)).toContain('<td>&lt;script&gt;alert(1)&lt;/script&gt;</td>');
    expect(html(admin)).toContain('<td>&quot;Vidal&quot; Bcc: x@evil.com</td>');
    expect(html(admin)).toContain('&lt;a href=&quot;https://evil&quot;&gt;Paga aquí&lt;/a&gt; segona línia');
  });

  it('escapa el nom a la benvinguda', async () => {
    const { deps, correus } = entorn();
    await gestionarNovaSolicitud(deps, 'sol-1', solicitud({ nom: 'D\'Amico' }), ARA);
    expect(html(correus[1])).toContain('<p>Hola D&#39;Amico,</p>');
  });

  it('amb una llista de correus no envia la benvinguda però avisa el club', async () => {
    const { deps, correus, avisos } = entorn();
    await gestionarNovaSolicitud(deps, 'sol-1', solicitud({ correuElectronic: ['a@x.com', 'b@y.com'] }), ARA);
    expect(correus).toHaveLength(1);
    expect(correus[0].to).toBe('cineclub.rodadebera@gmail.com');
    expect(html(correus[0])).toContain('<td>[valor no vàlid]</td>');
    expect(html(correus[0])).toContain('No s\'ha enviat el correu de benvinguda: el correu electrònic no té un format vàlid.');
    expect(avisos).toEqual([['No s\'envia la benvinguda de la sol·licitud', { id: 'sol-1', motiu: 'correu-no-valid' }]]);
  });

  it('amb un correu no vàlid no envia la benvinguda però avisa el club', async () => {
    const { deps, correus, avisos } = entorn();
    await gestionarNovaSolicitud(deps, 'sol-1', solicitud({ correuElectronic: 'a@x.com, b@y.com' }), ARA);
    expect(correus.map((c) => c.to)).toEqual(['cineclub.rodadebera@gmail.com']);
    expect(avisos[0][1].motiu).toBe('correu-no-valid');
  });

  it('no torna a enviar la benvinguda si ja hi havia una sol·licitud anterior amb el mateix correu', async () => {
    const { deps, correus, avisos, consultes } = entorn({
      altres: [{ id: 'sol-0', correuElectronic: 'anna@example.com', ms: ARA - 1000 }],
    });
    await gestionarNovaSolicitud(deps, 'sol-1', solicitud({ correuElectronic: 'Anna@Example.com' }), ARA);
    expect(consultes).toEqual([['Anna@Example.com', 'anna@example.com']]);
    expect(correus.map((c) => c.to)).toEqual(['cineclub.rodadebera@gmail.com']);
    expect(html(correus[0])).toContain('No s\'ha enviat el correu de benvinguda: ja hi havia una sol·licitud amb aquest correu.');
    expect(avisos[0][1]).toEqual({ id: 'sol-1', motiu: 'correu-repetit' });
  });

  it('una sol·licitud antiga sense data també compta com a anterior', async () => {
    const { deps, correus } = entorn({ altres: [{ id: 'importada', correuElectronic: 'anna@example.com', ms: null }] });
    await gestionarNovaSolicitud(deps, 'sol-1', solicitud(), ARA);
    expect(correus).toHaveLength(1);
  });

  it('la primera de dues sol·licituds amb el mateix correu sí que rep la benvinguda', async () => {
    const { deps, correus } = entorn({
      altres: [{ id: 'sol-2', correuElectronic: 'anna@example.com', ms: ARA + 1000 }],
    });
    await gestionarNovaSolicitud(deps, 'sol-1', solicitud(), ARA);
    expect(correus.map((c) => c.to)).toEqual(['cineclub.rodadebera@gmail.com', 'anna@example.com']);
  });

  it('amb la mateixa data desempata per id perquè només una rebi la benvinguda', async () => {
    const primera = entorn({ altres: [{ id: 'sol-2', correuElectronic: 'anna@example.com', ms: ARA }] });
    await gestionarNovaSolicitud(primera.deps, 'sol-1', solicitud(), ARA);
    expect(primera.correus).toHaveLength(2);
    const segona = entorn({ altres: [{ id: 'sol-0', correuElectronic: 'anna@example.com', ms: ARA }] });
    await gestionarNovaSolicitud(segona.deps, 'sol-1', solicitud(), ARA);
    expect(segona.correus).toHaveLength(1);
  });

  it(`no envia benvingudes si en l'última hora hi ha més de ${LIMIT_BENVINGUDES_HORA} sol·licituds`, async () => {
    const alLimit = entorn({ recentsHora: LIMIT_BENVINGUDES_HORA, recentsDia: LIMIT_BENVINGUDES_HORA });
    await gestionarNovaSolicitud(alLimit.deps, 'sol-1', solicitud(), ARA);
    expect(alLimit.correus).toHaveLength(2);

    const perSobre = entorn({ recentsHora: LIMIT_BENVINGUDES_HORA + 1, recentsDia: LIMIT_BENVINGUDES_HORA + 1 });
    await gestionarNovaSolicitud(perSobre.deps, 'sol-1', solicitud(), ARA);
    expect(perSobre.correus.map((c) => c.to)).toEqual(['cineclub.rodadebera@gmail.com']);
    expect(html(perSobre.correus[0])).toContain('No s\'ha enviat el correu de benvinguda: s\'han rebut massa sol·licituds en l\'última hora.');
    expect(perSobre.avisos[0][1]).toEqual({ id: 'sol-1', motiu: 'massa-solicituds' });
  });

  it(`per sobre de ${LIMIT_AVISOS_DIA} sol·licituds en 24 hores deixa d'enviar correus i avisa el club un sol cop`, async () => {
    const primera = entorn({ recentsHora: LIMIT_AVISOS_DIA + 1, recentsDia: LIMIT_AVISOS_DIA + 1 });
    await gestionarNovaSolicitud(primera.deps, 'sol-1', solicitud(), ARA);
    expect(primera.correus).toHaveLength(1);
    expect(primera.correus[0].to).toBe('cineclub.rodadebera@gmail.com');
    expect(primera.correus[0].message.subject).toBe('Massa sol·licituds d\'alta en 24 hores');
    expect(html(primera.correus[0])).not.toContain('Anna');
    expect(primera.avisos[0][1]).toEqual({ id: 'sol-1', motiu: 'limit-diari' });

    const seguent = entorn({ recentsHora: LIMIT_AVISOS_DIA + 2, recentsDia: LIMIT_AVISOS_DIA + 2 });
    await gestionarNovaSolicitud(seguent.deps, 'sol-1', solicitud(), ARA);
    expect(seguent.correus).toEqual([]);
    expect(seguent.avisos[0][1]).toEqual({ id: 'sol-1', motiu: 'limit-diari' });
  });
});
