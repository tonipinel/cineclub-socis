const { SOURCE_TAG } = require('./calendari');

// El client de Google es carrega només quan cal parlar amb Google, no en arrencar les altres funcions.
function apiGoogle(credencials) {
  const { calendar } = require('@googleapis/calendar');
  const { JWT } = require('google-auth-library');
  const auth = new JWT({
    email: credencials.client_email,
    key: credencials.private_key,
    scopes: ['https://www.googleapis.com/auth/calendar.events'],
  });
  return calendar({ version: 'v3', auth });
}

const esNostre = (e, sessioId) => e.extendedProperties?.private?.source === SOURCE_TAG
  && [sessioId, undefined].includes(e.extendedProperties.private.cineclubSessioId);

// Client mínim de Google Calendar: `{ llistar, cercar, crear, actualitzar, esborrar }`.
// `finestra` ({ timeMin, timeMax }) acota les llistes que no van per iCalUID.
function clientCalendari({ credencials, calendarId }, api = apiGoogle(credencials)) {
  async function llistarTots(filtres = {}) {
    const esdeveniments = [];
    let pageToken;
    do {
      const res = await api.events.list({
        calendarId, showDeleted: false, singleEvents: true, maxResults: 250, ...filtres, pageToken,
      });
      esdeveniments.push(...(res.data.items ?? []).filter((e) => (e.eventType ?? 'default') === 'default'));
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
    return esdeveniments;
  }

  return {
    llistar: (finestra = {}) => llistarTots(finestra),
    async cercar({ sessioId, iCalUIDs = [], finestra = {} }) {
      const llistes = await Promise.all([
        llistarTots({ privateExtendedProperty: [`cineclubSessioId=${sessioId}`], ...finestra }),
        ...iCalUIDs.map((iCalUID) => llistarTots({ iCalUID })),
      ]);
      return [...new Map(llistes.flat().map((e) => [e.id, e])).values()];
    },
    // Si ja hi ha un esdeveniment amb aquest iCalUID (409), es reaprofita: un d'esborrat (Google els guarda,
    // i poden venir sense `extendedProperties`) o un d'actiu nostre creat per un disparador concurrent.
    async crear(requestBody) {
      try {
        return await api.events.insert({ calendarId, requestBody });
      } catch (error) {
        if (error.code !== 409) throw error;
        const sessioId = requestBody.extendedProperties?.private?.cineclubSessioId;
        const antics = await llistarTots({ iCalUID: requestBody.iCalUID, showDeleted: true });
        const antic = antics.find((e) => e.status !== 'cancelled' && esNostre(e, sessioId))
          ?? antics.find((e) => e.status === 'cancelled'
            && (!e.extendedProperties?.private?.source || esNostre(e, sessioId)));
        if (!antic) throw error;
        const cos = { ...requestBody };
        delete cos.iCalUID;
        return api.events.patch({ calendarId, eventId: antic.id, requestBody: { ...cos, status: 'confirmed' } });
      }
    },
    actualitzar: (eventId, requestBody) => api.events.patch({ calendarId, eventId, requestBody }),
    esborrar: (eventId) => api.events.delete({ calendarId, eventId }),
  };
}

module.exports = { clientCalendari };
