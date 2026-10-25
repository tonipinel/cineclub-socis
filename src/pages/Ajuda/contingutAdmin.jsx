// Ajuda de l'administració: què fa cada pantalla i les tasques habituals. Descriu el que fa el codi de src/pages i
// src/lib: si una pantalla canvia, cal revisar-ne el text.

const PAGINES = {
  id: 'pagines',
  titol: 'Què fa cada pantalla',
  intro: (
    <p>
      El menú de dalt agrupa les pantalles: «Socis», «Programació», «Sala», «Comptabilitat», «Configuració» i «Ajuda»
      (aquesta pàgina). El logo
      porta al tauler (Dashboard).
    </p>
  ),
  apartats: [
    {
      id: 'pagina-dashboard',
      titol: 'Dashboard',
      cos: (
        <p>
          És la pantalla d'inici després d'entrar. Resumeix l'associació: total de socis actius, tiquets usats i
          disponibles, diners en efectiu i al banc, la votació de la tanda, les noves altes, l'assistència, la «Rentabilitat
          de les sessions», la comptabilitat i l'evolució econòmica.
        </p>
      ),
    },
    {
      id: 'pagina-socis',
      titol: 'Socis',
      cos: (
        <>
          <p>
            <strong>Socis › Socis</strong>: llistat de tots els socis amb número, estat («Al dia», «Pendent», «Vençut»,
            «Nou registre» i «Desactivat»), venciment i assistències dels últims 12 mesos. Es pot cercar, filtrar per estat
            (també «Renovació pròxima (30 dies)») i ordenar per columna. Marcant socis apareix «Imprimir carnets».
          </p>
          <p>
            <strong>Fitxa del soci</strong>: dades personals (es desen amb la barra de baix), número, dates de la quota,
            activació del carnet, venciment, el carnet, l'estat (desactivar o reactivar), els pagaments i les sessions a què
            ha vingut en el període actual. «Persona de l'organització del Cineclub» fa que les seves propostes surtin amb el nom de
            l'organització.
          </p>
          <p>
            <strong>Registrar pagament</strong>: cobrament de la quota (alta o renovació). <strong>Carnet</strong>: el
            carnet d'un soci a mida de funda, per imprimir. <strong>Carnets</strong>: diversos carnets en un A4 apaïsat.
          </p>
        </>
      ),
    },
    {
      id: 'pagina-solicituds',
      titol: 'Sol·licituds',
      cos: (
        <p>
          <strong>Socis › Sol·licituds</strong>: les peticions d'alta que arriben del formulari «Fes-te sòcia» de la web.
          Es poden aprovar (crea el soci) o descartar. El número al costat del menú són les pendents.
        </p>
      ),
    },
    {
      id: 'pagina-propostes',
      titol: 'Propostes',
      cos: (
        <>
          <p>
            <strong>Programació › Propostes</strong>: les pel·lícules proposades pels socis o per l'organització, amb el
            seu estat («Pendent», «Aprovada», «Rebutjada», «Programada»). Es pot filtrar per estat, tanda i distribuïdora,
            cercar i veure-les en llista o agrupades per tanda. El número del menú són les pendents de revisar (sense
            comptar les de l'organització).
          </p>
          <p>
            La <strong>fitxa de la proposta</strong> té quatre pestanyes: «Resum», «Pel·lícula» (dades de TMDB i
            «Actualitzar des de TMDB»), «Gestió» (soci, estat, comentari i les dades privades: distribuïdora, preu i
            condicions) i «Mitjans» (cartell i tràiler). A la web pública només surten les aprovades i les programades.
          </p>
        </>
      ),
    },
    {
      id: 'pagina-tandes',
      titol: 'Tandes',
      cos: (
        <p>
          <strong>Programació › Tandes</strong>: les votacions dels socis. Cada tanda té un nom, unes propostes aprovades i
          una data de tancament. Només hi pot haver una tanda oberta alhora. Des de cada tanda s'obren les seves propostes i
          els «Resultats».
        </p>
      ),
    },
    {
      id: 'pagina-sessions',
      titol: 'Sessions',
      cos: (
        <>
          <p>
            <strong>Programació › Sessions</strong>: totes les sessions, de la més nova a la més antiga, amb els socis, els
            no socis i la rendibilitat de cadascuna. L'estrella marca la sessió activa. El botó del calendari
            sincronitza les sessions amb el calendari de Google (primer ensenya què es crearà, actualitzarà o esborrarà, i
            «Aplicar els canvis» ho fa).
          </p>
          <p>
            La <strong>fitxa de la sessió</strong> té les pestanyes «Estadístiques» (assistència, entrades per franja
            horària, desglossament econòmic, moviments, socis que han vingut i aportacions), «Dades», «Continguts» i
            «Mitjans», que formen la pàgina pública de la sessió.
          </p>
        </>
      ),
    },
    {
      id: 'pagina-distribuidores',
      titol: 'Distribuïdores',
      cos: (
        <p>
          <strong>Programació › Distribuïdores</strong>: catàleg de distribuïdores amb web, logo, contacte, preu i
          condicions per defecte. Es fan servir a les propostes i a les sessions.
        </p>
      ),
    },
    {
      id: 'pagina-entitats',
      titol: 'Entitats',
      cos: (
        <p>
          <strong>Programació › Entitats</strong>: catàleg d'entitats que organitzen, participen o col·laboren a les
          sessions, amb el nom, la pàgina web i el logo que surten a la pàgina pública.
        </p>
      ),
    },
    {
      id: 'pagina-escaneig',
      titol: 'Escaneig i LOG',
      cos: (
        <p>
          <strong>Sala › Escaneig</strong>: registra les entrades de la sessió activa amb la càmera o escrivint el codi. El
          «LOG» és el registre d'incidències d'escaneig. Tot s'explica a la «Guia d'escaneig a la porta».
        </p>
      ),
    },
    {
      id: 'pagina-tiquets',
      titol: 'Tiquets',
      cos: (
        <p>
          <strong>Sala › Tiquets</strong>: lots de tiquets per als no socis. Cada lot té codis correlatius (T-000001…), un
          preu i un estat («Pendent d'imprimir», «Imprès», «Anul·lat»). La fitxa del lot mostra els tiquets per imprimir,
          quants en queden disponibles i quins s'han usat.
        </p>
      ),
    },
    {
      id: 'pagina-comptabilitat',
      titol: 'Comptabilitat',
      cos: (
        <p>
          <strong>Comptabilitat</strong>: tots els moviments (ingressos, despeses i traspassos) amb filtres per tipus,
          categoria, sessió i dates. A dalt hi ha la disponibilitat en efectiu, la bancària i el fons total de tresoreria.
        </p>
      ),
    },
    {
      id: 'pagina-configuracio',
      titol: 'Configuració',
      cos: (
        <>
          <p>
            <strong>Configuració › Associació</strong>: la quota anual i el número de compte (IBAN). La quota és l'import
            que surt per defecte en registrar un pagament, i totes dues dades es fan servir, per exemple, al correu de
            benvinguda de les sol·licituds.
          </p>
          <p>
            <strong>Configuració › Usuaris de taquilla</strong>: comptes per a les persones que escanegen a la porta.
            Només poden fer servir l'escaneig (i aquesta ajuda).
          </p>
        </>
      ),
    },
  ],
};

const TASQUES = {
  id: 'tasques',
  titol: 'Tasques habituals pas a pas',
  apartats: [
    {
      id: 'tasca-proposar',
      titol: 'Proposar una pel·lícula',
      cos: (
        <>
          <p>
            <strong>Per a què serveix:</strong> recollir les pel·lícules que es podrien programar. Les aprovades es poden
            posar en una tanda perquè els socis les votin.
          </p>
          <p>Un soci, a la web pública (cineclubrodadebera.cat/propostes/proposar/):</p>
          <ol>
            <li>Escaneja el seu carnet per identificar-se.</li>
            <li>Cerca la pel·lícula, hi pot afegir per què la recomana i toca «Enviar proposta».</li>
            <li>La proposta queda «Pendent» i no es publica fins que l'organització l'aprova.</li>
          </ol>
          <p>L'administració, en nom d'un soci:</p>
          <ol>
            <li>Ves a «Programació › Propostes» i toca «Nova proposta».</li>
            <li>Tria el soci, escriu el títol i, si cal, un enllaç i un comentari, i toca «Crear proposta».</li>
            <li>S'obre la fitxa de la proposta, en estat «Pendent».</li>
          </ol>
          <p>Per revisar-la:</p>
          <ol>
            <li>A la pestanya «Pel·lícula», tria la pel·lícula de TMDB si encara no en té.</li>
            <li>A «Gestió», canvia l'estat a «Aprovada» o «Rebutjada» i, si cal, tria la distribuïdora, el preu i les condicions (són privades).</li>
            <li>Desa amb la barra de baix.</li>
          </ol>
        </>
      ),
    },
    {
      id: 'tasca-tanda',
      titol: 'Crear una tanda de votació',
      cos: (
        <>
          <p>
            <strong>Per a què serveix:</strong> que els socis votin les propostes aprovades i saber quines agraden més per
            programar-les.
          </p>
          <ol>
            <li>Ves a «Programació › Tandes» i toca «Nova tanda». Si ja n'hi ha una d'oberta, primer cal tancar-la.</li>
            <li>Posa-li un nom, marca les propostes aprovades que hi entren (hi ha un cercador) i tria quan «Tanca» (data i hora futures).</li>
            <li>Desa. La tanda queda oberta fins a la data de tancament, o fins que toquis «Tancar ara».</li>
          </ol>
          <ul>
            <li>
              Els socis voten a la web pública (cineclubrodadebera.cat/propostes/votar/): s'identifiquen escanejant el
              carnet i marquen 👍 o 👎 a cada proposta. Poden votar els socis actius amb número i carnet.
            </li>
            <li>
              A «Resultats» es veu quants socis han participat i acabat, el percentatge de 👍 de cada pel·lícula i els vots
              de cada soci. Es poden esborrar els vots d'un soci (si la tanda és oberta, podrà tornar a votar).
            </li>
            <li>Quan una tanda oberta ja té vots, no se'n poden canviar les propostes: tanca-la i crea'n una de nova.</li>
            <li>Un cop tancada, la web pública ensenya el rànquing amb el percentatge de cada pel·lícula. El Dashboard també mostra la votació.</li>
          </ul>
        </>
      ),
    },
    {
      id: 'tasca-sessio',
      titol: 'Crear una sessió nova',
      cos: (
        <>
          <p>
            <strong>Per a què serveix:</strong> cada projecció és una sessió. Hi van les entrades de l'escaneig, els
            moviments de comptabilitat i la pàgina pública de la pel·lícula.
          </p>
          <p>Des d'una proposta aprovada (recomanat):</p>
          <ol>
            <li>Obre la proposta i toca «Programar sessió». Confirma-ho.</li>
            <li>Es crea una sessió sense publicar i sense data, la proposta passa a «Programada» i s'obre la fitxa de la sessió. Més endavant, «Veure la sessió» de la proposta hi torna.</li>
          </ol>
          <p>O des de zero:</p>
          <ol>
            <li>Ves a «Programació › Sessions» i toca «Nova sessió».</li>
            <li>Escriu el títol, la data i l'hora d'inici i desa.</li>
          </ol>
          <p>Després, a la fitxa de la sessió:</p>
          <ol>
            <li>A «Dades»: la pel·lícula, el preu d'entrada, el suport de distribució, qui organitza, participa i col·labora, i l'slug (la part de l'URL).</li>
            <li>A «Continguts»: descripció, ganxo, sinopsi del cartell i textos editorials, amb vista prèvia.</li>
            <li>A «Mitjans»: el cartell, la galeria i el tràiler de YouTube.</li>
            <li>Per publicar-la, marca «Publicada» a «Dades» i desa. Si falta alguna dada, la barra de baix diu quina.</li>
          </ol>
        </>
      ),
    },
    {
      id: 'tasca-activa',
      titol: 'Marcar la sessió activa',
      cos: (
        <>
          <p>
            <strong>Per a què serveix:</strong> la sessió activa és la que compta les entrades a l'escaneig. Sense sessió
            activa, a la porta no es pot escanejar.
          </p>
          <ol>
            <li>Obre la fitxa de la sessió d'avui (cal que tingui data).</li>
            <li>A la capçalera, toca l'estrella «Marcar com a activa».</li>
            <li>La sessió passa a tenir l'estrella i la insígnia «Activa».</li>
          </ol>
          <ul>
            <li>Només hi ha una sessió activa: en marcar-ne una, l'anterior deixa de ser-ho automàticament.</li>
            <li>Les entrades ja registrades es queden a la sessió on es van fer; les noves van a la nova sessió activa.</li>
            <li>La pantalla d'escaneig canvia sola de sessió, sense recarregar. Si en aquell moment es comprovava un codi, demana tornar-lo a escanejar.</li>
            <li>No hi ha cap botó per treure l'estrella: es canvia marcant-ne una altra. Les sessions especials (sense control d'entrades) no es poden marcar.</li>
          </ul>
        </>
      ),
    },
    {
      id: 'tasca-alta',
      titol: "Donar d'alta un soci",
      cos: (
        <>
          <p>
            <strong>Per a què serveix:</strong> que la persona tingui número i carnet per entrar a les sessions, votar i
            proposar pel·lícules.
          </p>
          <ol>
            <li>Ves a «Socis › Socis» i toca «Donar d'alta».</li>
            <li>Omple les dades (nom, cognoms, contacte…) i desa. S'obre la fitxa amb «Número de soci/a: pendent d'assignar» i l'estat «Nou registre».</li>
            <li>Toca «Registrar pagament» i registra la primera quota (vegeu «Registrar un pagament»). En aquest moment se li assigna el número següent.</li>
            <li>Imprimeix-li el carnet des de la fitxa (vegeu «Imprimir i regenerar el carnet»).</li>
          </ol>
          <p>Com compta la quota:</p>
          <ul>
            <li>
              <strong>Alta</strong> (primer pagament, o el primer després d'una baixa): l'any compta des del primer cop que
              s'escaneja el carnet a partir del dia del pagament. Ara mateix aquesta data només es desa si l'escaneig el fa
              un compte d'administració: si l'escaneja la taquilla, la fitxa continua dient «Encara no ha escanejat des del
              pagament» i el venciment es compta des del dia del pagament.
            </li>
            <li>
              <strong>Renovació</strong>: encadenada. Comença el dia que venç la quota actual (o el dia del pagament si ja
              havia vençut) i dura 12 mesos justos; escanejar no la retarda ni l'allarga.
            </li>
          </ul>
          <p>Baixa i nova alta:</p>
          <ol>
            <li>A la fitxa, toca «Desactivar soci», escriu el motiu i confirma. El carnet deixa de funcionar a l'escaneig i a la web.</li>
            <li>Per tornar-lo a donar d'alta, toca «Reactivar soci» i registra-li un pagament: comptarà com una alta nova (l'any torna a començar al primer escaneig) i es perden els dies que quedaven de la quota anterior.</li>
            <li>Registrar un pagament no reactiva el soci: cal reactivar-lo a mà.</li>
          </ol>
        </>
      ),
    },
    {
      id: 'tasca-solicitud',
      titol: "Gestionar les sol·licituds d'alta",
      cos: (
        <>
          <p>
            <strong>Per a què serveix:</strong> convertir en socis les persones que s'han apuntat des de la web.
          </p>
          <ol>
            <li>Ves a «Socis › Sol·licituds». A «Pendents» hi ha les noves, amb les seves dades.</li>
            <li>
              Toca ✓ («Aprovar») per crear el soci: se li assigna número i carnet al moment. Surt un avís amb «Desfer» per
              si t'has equivocat (esborra el soci i la sol·licitud torna a pendent).
            </li>
            <li>Toca ✗ («Descartar») si no s'ha de donar d'alta. Va a «Descartades», d'on es pot tornar a pendent o eliminar definitivament.</li>
            <li>Quan pagui, registra-li el pagament des de la seva fitxa: comptarà com a alta.</li>
          </ol>
        </>
      ),
    },
    {
      id: 'tasca-pagament',
      titol: 'Registrar un pagament de quota',
      cos: (
        <>
          <p>
            <strong>Per a què serveix:</strong> deixar constància del cobrament, posar la quota al dia i apuntar l'ingrés
            a la comptabilitat.
          </p>
          <ol>
            <li>Obre la fitxa del soci i toca «Registrar pagament».</li>
            <li>Revisa la data (avui per defecte), l'import (la quota anual de «Configuració») i el mètode: efectiu, datàfon o transferència.</li>
            <li>Si és una alta, tria la sessió a què es vincula (surt la més propera a avui). Una renovació no es vincula a cap sessió.</li>
            <li>Llegeix l'avís de quan comptarà i vencerà la quota, toca «Registrar pagament» i confirma. No es pot desfer des d'aquí.</li>
          </ol>
          <p>
            Es crea un moviment «Quotes socis» a «Comptabilitat». Si cal corregir-lo, edita'l o elimina'l des de
            «Comptabilitat»: la fitxa del soci es torna a calcular. Els moviments de quota nous només es poden crear des
            de la fitxa del soci.
          </p>
        </>
      ),
    },
    {
      id: 'tasca-carnet',
      titol: 'Imprimir i regenerar el carnet',
      cos: (
        <>
          <p>
            <strong>Per a què serveix:</strong> el carnet porta el QR que es llegeix a la porta i a la web per votar i
            proposar.
          </p>
          <ol>
            <li>Un carnet: a la fitxa del soci, toca el carnet i imprimeix la pàgina (surt a mida de funda).</li>
            <li>Diversos: a «Socis › Socis», marca els socis, toca «Imprimir carnets» i després «Imprimir o desar com a PDF».</li>
          </ol>
          <p>
            <strong>Regenerar carnet</strong> (a la fitxa, si el soci és actiu i té número) fa un QR nou, per exemple si l'ha perdut.
            El carnet imprès fins ara <strong>deixa de funcionar</strong> a la porta i a la web: cal imprimir-ne i
            donar-li'n un de nou.
          </p>
        </>
      ),
    },
    {
      id: 'tasca-tiquets',
      titol: 'Crear tiquets',
      cos: (
        <>
          <p>
            <strong>Per a què serveix:</strong> els no socis entren amb un tiquet amb QR. En escanejar-lo compta com a «No
            soci» i suma el preu del lot a l'import de la sessió.
          </p>
          <ol>
            <li>Ves a «Sala › Tiquets», posa la quantitat (fins a 500) i el preu, i toca el botó +.</li>
            <li>Confirma-ho: es reserven números nous que no es repetiran mai. S'obre el lot.</li>
            <li>Toca «Imprimir» i, quan estiguin impresos, «Marcar com imprès».</li>
          </ol>
          <ul>
            <li>Es pot anul·lar un tiquet (i reactivar-lo) o tot el lot amb «Anul·lar tot el lot» (no es pot desfer). Un tiquet anul·lat no entra.</li>
            <li>
              Les aportacions dels tiquets no s'apunten soles a la comptabilitat. A la pestanya «Estadístiques» de la
              sessió surt «Falta afegir les … aportacions…» amb l'enllaç «Afegir-les ara».
            </li>
          </ul>
        </>
      ),
    },
    {
      id: 'tasca-moviment',
      titol: 'Apuntar un moviment de comptabilitat',
      cos: (
        <>
          <p>
            <strong>Per a què serveix:</strong> portar els comptes de l'associació (caixa i banc) i saber què ha costat i
            què ha donat cada sessió.
          </p>
          <ol>
            <li>Ves a «Comptabilitat» i toca «Afegir moviment» (o, des d'una sessió, «Afegir moviment d'aquesta sessió»).</li>
            <li>Omple la data, el concepte i el tipus: «Ingrés», «Despesa» o «Traspàs» entre caixa i banc.</li>
            <li>Tria la categoria: un ingrés pot ser «Aportacions»; una despesa, «Gestió pel·lícules» (cal triar-ne la sessió) o «Gestió associació».</li>
            <li>Tria el mètode de pagament, la sessió si en té, el preu unitari i la quantitat (el total es calcula sol). Pots adjuntar la factura.</li>
            <li>Desa amb la barra de baix.</li>
          </ol>
          <p>
            Els moviments en efectiu compten a la caixa; els de datàfon, transferència o banc, al banc. Un moviment es pot
            editar o eliminar des de la seva fitxa.
          </p>
        </>
      ),
    },
    {
      id: 'tasca-distribuidora',
      titol: 'Crear una distribuïdora',
      cos: (
        <>
          <p>
            <strong>Per a què serveix:</strong> tenir les dades de qui cedeix els drets de les pel·lícules i mostrar-ne el
            logo a la pàgina pública de la sessió.
          </p>
          <ol>
            <li>Ves a «Programació › Distribuïdores» i toca «Nova distribuïdora».</li>
            <li>Escriu el nom (obligatori), la web, la «Pàgina web pública» (on porta el logo a la web) i puja el logo.</li>
            <li>Afegeix el contacte i, si n'hi ha, el preu i les condicions per defecte. Desa.</li>
          </ol>
          <ul>
            <li>A la pestanya «Gestió» d'una proposta, tria-la a «Distribuïdora»: si la proposta no té preu ni condicions propis, s'hi apliquen els de la distribuïdora.</li>
            <li>
              A la pestanya «Dades» d'una sessió, tria-la a «Suport de distribució». La pàgina pública, si la sessió té
              cartell, hi mostra a sota el logo (enllaçat a la pàgina web pública) o, si la distribuïdora no té logo, el
              text «Distribució i cessió de drets: …».
            </li>
            <li>No es pot eliminar mentre alguna proposta o sessió la faci servir.</li>
          </ul>
        </>
      ),
    },
    {
      id: 'tasca-entitat',
      titol: 'Crear una entitat',
      cos: (
        <ol>
          <li>Ves a «Programació › Entitats» i toca «Nova entitat».</li>
          <li>Escriu el nom (després no es pot canviar), la pàgina web pública i puja el logo. Desa.</li>
          <li>A la pestanya «Dades» d'una sessió, tria-la a «Organitza», «Participen» o «Col·laboren».</li>
        </ol>
      ),
    },
    {
      id: 'tasca-taquilla',
      titol: 'Crear i gestionar usuaris de taquilla',
      cos: (
        <>
          <p>
            <strong>Per a què serveix:</strong> que les persones de la porta puguin escanejar amb el seu compte, sense
            accés a la resta de l'administració.
          </p>
          <ol>
            <li>Ves a «Configuració › Usuaris de taquilla» i toca «Nou usuari».</li>
            <li>Escriu el nom i el correu electrònic i toca «Crea l'usuari».</li>
            <li>
              La persona rep un correu amb un enllaç per triar la contrasenya. Si el correu no s'ha pogut enviar, la
              pantalla mostra l'enllaç: copia'l i fes-l'hi arribar només a ella.
            </li>
          </ol>
          <ul>
            <li>«Desactiva» li treu l'accés (si tenia la sessió oberta, la perd en menys d'una hora); «Reactiva» l'hi torna.</li>
            <li>«Restableix la contrasenya» anul·la l'actual, li tanca les sessions i li envia un enllaç nou. Canviar-li el correu fa el mateix.</li>
            <li>«Elimina» (al llistat, o «Elimina l'usuari» a la fitxa) li treu l'accés per sempre. La fitxa de l'usuari mostra l'historial de canvis.</li>
          </ul>
        </>
      ),
    },
  ],
};

export const SECCIONS_ADMIN = [PAGINES, TASQUES];
