// Guia d'escaneig per a la porta (taquilla i admin). Textos de pantalla copiats de pages/Escaneig/EscaneigPage.jsx i
// pages/Escaneig/EscaneigLogPage.jsx: si canvien allà, cal canviar-los aquí.

export const SECCIO_ESCANEIG = {
  id: 'escaneig',
  titol: "Guia d'escaneig a la porta",
  intro: (
    <p>
      La pantalla «Escaneig» registra qui entra a la sessió: els socis amb el carnet i els no socis amb un tiquet.
      Les entrades es compten a la <strong>sessió activa</strong>, que surt a la part de baix de la pantalla amb una estrella.
    </p>
  ),
  apartats: [
    {
      id: 'escaneig-abans',
      titol: "Abans d'obrir la porta",
      cos: (
        <ol>
          <li>
            Obre «Escaneig» al mòbil o a la tauleta. A la part de baix ha de sortir el títol de la sessió d'avui.
          </li>
          <li>
            Si surt «No hi ha cap sessió activa», no es pot escanejar: demana a l'administració que marqui la sessió
            d'avui com a activa. Quan ho faci, la pantalla canvia sola.
          </li>
          <li>
            Toca «Mode prova» i escaneja un carnet i un tiquet per comprovar que la càmera llegeix bé (vegeu «Mode
            prova»). Després torna'l a tocar perquè quedi «desactivat».
          </li>
          <li>Deixa la pantalla oberta tota la sessió i no la recarreguis.</li>
        </ol>
      ),
    },
    {
      id: 'escaneig-passos',
      titol: 'Escanejar un carnet o un tiquet',
      cos: (
        <>
          <ol>
            <li>Toca «Escanejar». La primera vegada, el navegador demana permís per fer servir la càmera: accepta'l.</li>
            <li>
              Apunta la càmera al codi QR del carnet o del tiquet. Mentre es comprova surt «Comprovant el codi…» (o
              «Reintentant…» si la connexió va lenta).
            </li>
            <li>
              Mira el resultat: en verd, l'entrada s'ha registrat; en taronja, és un avís; en vermell, no s'ha registrat
              (vegeu «Què vol dir cada resultat»).
            </li>
            <li>
              Toca «Escanejar un altre» per a la persona següent. Mentre hi ha un resultat a la pantalla, la càmera no
              llegeix res.
            </li>
          </ol>
          <p>
            A la part de baix hi ha el recompte de la sessió: «Socis» (cada soci compta una vegada), «No socis» (tiquets)
            i «Import» (la suma dels tiquets). La creu torna a la pantalla inicial.
          </p>
        </>
      ),
    },
    {
      id: 'escaneig-manual',
      titol: 'Escriure el codi a mà',
      cos: (
        <>
          <p>Serveix quan el soci no porta el carnet, el QR no es llegeix o la càmera no funciona.</p>
          <ol>
            <li>Toca «Introduir codi manualment» (també surt sota la càmera).</li>
            <li>
              Al camp «Codi manual», escriu el número de soci (per exemple <code>123</code>, o <code>SOCI-123</code> com
              surt imprès sota el QR del carnet) o el codi del tiquet (per exemple <code>T-000123</code>).
            </li>
            <li>Toca «Registrar».</li>
          </ol>
          <p>
            El número de soci és fàcil de saber: quan l'escriguis a mà, comprova que la persona és qui diu ser. Per això,
            un QR que només porti el número (<code>SOCI-123</code>) no s'accepta amb la càmera.
          </p>
        </>
      ),
    },
    {
      id: 'escaneig-resultats',
      titol: 'Què vol dir cada resultat',
      cos: (
        <dl>
          <dt>Nom del soci amb «Al dia» i «Venç el …»</dt>
          <dd>
            Entrada registrada. Si la quota venç d'aquí a 30 dies o menys, la data surt amb un triangle d'avís: recorda-li
            que haurà de renovar.
          </dd>
          <dt>Nom del soci amb «Vençut»</dt>
          <dd>
            L'entrada s'ha registrat igualment, però la quota ja ha vençut. Recorda-li que ha de renovar.
          </dd>
          <dt>Nom del soci amb «Pendent»</dt>
          <dd>L'entrada s'ha registrat; la fitxa del soci està marcada com a pendent. Avisa l'administració.</dd>
          <dt>Nom del soci en vermell, amb «Soci desactivat» o «Aquest soci està desactivat»</dt>
          <dd>No s'ha registrat: el soci s'ha donat de baixa i el seu carnet ja no serveix.</dd>
          <dt>«Aquest carnet no és vàlid.»</dt>
          <dd>
            El carnet ja no serveix, per exemple perquè se n'ha fet un de nou. Escriu el número a mà, comprova la
            identitat i avisa l'administració.
          </dd>
          <dt>«No hi ha cap soci amb el número …»</dt>
          <dd>El número escrit no existeix. Comprova'l al carnet.</dd>
          <dt>«Aquest QR no és un carnet vàlid»</dt>
          <dd>El QR només porta el número de soci. Escaneja el QR del carnet o escriu el número a mà.</dd>
          <dt>«Codi no reconegut: …»</dt>
          <dd>El codi no és ni un carnet ni un tiquet.</dd>
          <dt>«Entrada genèrica registrada (5€)»</dt>
          <dd>Tiquet comptat com a «No soci» amb el preu del seu lot.</dd>
          <dt>«Codi ja utilitzat»</dt>
          <dd>
            Aquest tiquet ja s'havia escanejat (el missatge diu quan). Si de debò s'ha de comptar, toca «Comptar igualment» i
            confirma-ho; si no, no el deixis passar com a nou.
          </dd>
          <dt>«El codi T-… ha estat anul·lat.» o «… no pertany a cap lot de tiquets conegut.»</dt>
          <dd>El tiquet no és vàlid, o el codi s'ha escrit malament.</dd>
          <dt>«Aquest codi ja s'ha registrat fa un moment.»</dt>
          <dd>S'ha llegit el mateix codi dues vegades en menys de 3 segons. Només s'ha comptat una vegada.</dd>
          <dt>«Encara carregant els lots de tiquets. Torna-ho a provar.»</dt>
          <dd>La pantalla acaba d'obrir-se. Espera un moment i torna-hi.</dd>
          <dt>«La sessió activa ha canviat. Torna a escanejar el codi.»</dt>
          <dd>L'administració ha canviat la sessió activa mentre es comprovava el codi. No s'ha desat: torna'l a escanejar.</dd>
          <dt>«No s'ha pogut registrar l'entrada. Torna-ho a provar.»</dt>
          <dd>Hi ha hagut un error en desar-la. Torna a escanejar el codi.</dd>
        </dl>
      ),
    },
    {
      id: 'escaneig-prova',
      titol: 'Mode prova',
      cos: (
        <>
          <p>
            Serveix per comprovar, abans d'obrir la porta, que la càmera llegeix els carnets i els tiquets. El botó és a la
            part de baix: «Mode prova: desactivat» o «Mode prova: activat».
          </p>
          <ul>
            <li>Mentre està activat, a dalt surt «Mode prova: no es desa res».</li>
            <li>
              Els codis es comproven igual que de debò (soci, estat, venciment, tiquet), però <strong>no es desa
              res</strong>: ni l'entrada, ni cap incidència al LOG, i el recompte no canvia. El resultat diu «Mode prova:
              no s'ha desat res. S'afegiria a «…».», amb el nom de la sessió activa.
            </li>
            <li>També cal una sessió activa per fer-lo servir.</li>
            <li>
              <strong>Desactiva'l abans que entri la primera persona.</strong> No es recorda: si la pàgina es recarrega,
              torna a estar desactivat.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: 'escaneig-no-recarregar',
      titol: 'No recarreguis ni tanquis la pàgina durant la sessió',
      cos: (
        <>
          <p className="ajuda__avis">
            Durant la sessió, no recarreguis la pàgina, no la tanquis i no canviïs de pantalla. Consulta el LOG o
            aquesta ajuda només quan no s'estigui comprovant cap codi ni hi hagi entrades pendents d'enviar.
          </p>
          <ul>
            <li>
              Amb mala connexió, si el servidor no confirma una entrada en 8 segons, l'entrada es queda guardada només
              al dispositiu i s'envia sola quan torna la xarxa. Si recarregues o tanques la pàgina abans, aquestes
              entrades es perden. Mentre n'hi ha, a dalt surt «1 entrada pendent d'enviar» (o «… entrades pendents
              d'enviar»).
            </li>
            <li>
              Si surts de la pantalla mentre es comprova un codi, aquell codi no es desa (al LOG surt «Escaneig
              abandonat»).
            </li>
            <li>
              Els avisos de la part de dalt (entrades pendents o que no s'han pogut enviar) desapareixen si recarregues, i
              ja no sabries quines cal tornar a escanejar.
            </li>
            <li>
              No cal recarregar per veure els canvis: la sessió activa, el recompte i els tiquets s'actualitzen sols. Si
              surt «No es reben les dades en directe…», toca «Torna-ho a provar» en lloc de recarregar.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: 'escaneig-problemes',
      titol: 'Si alguna cosa no funciona',
      cos: (
        <dl>
          <dt>La càmera no s'obre: «No s'ha pogut accedir a la càmera. Utilitza el camp de text.»</dt>
          <dd>
            El navegador no té permís per fer servir la càmera. Dona-li permís a la configuració del navegador i, mentrestant,
            escriu els codis a mà.
          </dd>
          <dt>El lector no arrenca: «No s'ha pogut carregar el lector de codis. Pots escriure el codi a mà.»</dt>
          <dd>
            La pantalla passa sola a l'entrada manual. Escriu els codis a mà i, quan vulguis, toca «Tornar a provar la
            càmera».
          </dd>
          <dt>Sense connexió</dt>
          <dd>
            A dalt surt «Sense connexió». Sense xarxa no es pot comprovar un tiquet ni, normalment, un soci («No es pot
            comprovar el soci (sense connexió). Reintenta quan hi hagi xarxa.»); un soci que ja s'ha escanejat abans en
            aquesta pantalla sí que pot entrar, i l'entrada queda pendent d'enviar. La comprovació espera uns segons, ho
            torna a provar sola («Reintentant…») i, si tampoc no pot, avisa (en total, fins a uns 13 segons). Torna a
            escanejar quan hi hagi xarxa.
          </dd>
          <dt>«Sense connexió estable: l'entrada s'ha desat al dispositiu i s'enviarà quan torni la xarxa.»</dt>
          <dd>
            L'entrada ja està guardada: <strong>no tornis a escanejar aquest codi</strong> i no recarreguis la pàgina. Si
            el tornes a escanejar, surt «Aquest codi és pendent d'enviar-se; espera que torni la connexió.» i no es compta
            dues vegades.
          </dd>
          <dt>«Una entrada no s'ha pogut enviar: … Torna-la a escanejar.»</dt>
          <dd>
            Una entrada pendent ha estat rebutjada en arribar al servidor. Torna a escanejar aquell codi i tanca l'avís
            amb la creu.
          </dd>
          <dt>«No es reben les dades en directe…» o «No s'ha pogut carregar la sessió activa…»</dt>
          <dd>Toca «Torna-ho a provar». Mentrestant, si ja hi ha sessió activa, pots continuar escanejant.</dd>
          <dt>La mateixa persona s'escaneja dues vegades</dt>
          <dd>
            Un soci només compta una vegada a «Socis» encara que s'escanegi més cops. Un tiquet repetit surt com a «Codi
            ja utilitzat».
          </dd>
          <dt>El soci té la quota vençuda o està de baixa</dt>
          <dd>
            Amb la quota vençuda, l'entrada es registra amb «Vençut». Si està de baixa (desactivat), no es registra. Vegeu
            «Què vol dir cada resultat».
          </dd>
        </dl>
      ),
    },
    {
      id: 'escaneig-log',
      titol: "El registre d'incidències (LOG)",
      cos: (
        <>
          <p>
            L'enllaç «LOG» de la part de baix obre «Incidències d'escaneig»: les 200 últimes lectures, de totes les
            sessions, que no han anat bé
            o que han tingut algun problema, de la més nova a la més antiga. Serveix per saber després què ha passat,
            per exemple si un carnet concret falla sempre (potser està mal imprès). El mode prova no hi escriu res.
          </p>
          <p>
            Cada línia mostra la data i l'hora, el motiu, el codi (d'un carnet només els 4 primers caràcters), si s'ha
            llegit amb «QR» o «Manual», la sessió i, si n'hi ha, un detall i dades tècniques (en línia o fora de línia,
            temps, intents).
          </p>
          <dl>
            <dt>Codi no reconegut</dt>
            <dd>El codi no era ni un carnet ni un tiquet.</dd>
            <dt>QR amb número de soci (no és un carnet)</dt>
            <dd>La càmera ha llegit un QR amb només el número de soci; no s'accepta.</dd>
            <dt>Soci no trobat</dt>
            <dd>No hi ha cap soci amb aquest número, o el carnet ja no és vàlid (per exemple, se n'ha fet un de nou).</dd>
            <dt>Soci desactivat</dt>
            <dd>El soci està de baixa; el detall diu el motiu.</dd>
            <dt>Tiquet anul·lat</dt>
            <dd>El tiquet, o tot el seu lot, s'ha anul·lat.</dd>
            <dt>Tiquet desconegut</dt>
            <dd>El codi no pertany a cap lot de tiquets (sovint, mal escrit).</dd>
            <dt>Tiquet ja utilitzat</dt>
            <dd>El tiquet ja s'havia escanejat abans. Si es va tocar «Comptar igualment», sí que es va comptar.</dd>
            <dt>Error inesperat</dt>
            <dd>Error de l'aplicació en comprovar el codi; no s'ha desat. El detall diu quin.</dd>
            <dt>Reescaneig dins 3 s</dt>
            <dd>El mateix codi s'ha llegit dues vegades seguides; només s'ha comptat una vegada.</dd>
            <dt>Lots encara no carregats</dt>
            <dd>S'ha escanejat un tiquet abans que la pantalla acabés de carregar els lots.</dd>
            <dt>Error d'escriptura</dt>
            <dd>
              El servidor ha rebutjat l'entrada i no s'ha desat. Si el detall comença per «Després del temps límit», era
              una entrada pendent d'enviar que al final no ha arribat.
            </dd>
            <dt>Escriptura sense confirmar (8 s)</dt>
            <dd>El servidor no ha confirmat l'entrada en 8 segons; s'ha quedat al dispositiu, pendent d'enviar.</dd>
            <dt>Sense connexió</dt>
            <dd>No s'ha pogut comprovar el soci o el tiquet per falta de connexió; no s'ha desat.</dd>
            <dt>Codi pendent d'enviar</dt>
            <dd>S'ha tornat a escanejar un codi que ja era pendent d'enviar; no s'ha comptat dues vegades.</dd>
            <dt>Lectura lenta (reintent correcte)</dt>
            <dd>La primera comprovació ha trigat massa, però el segon intent ha anat bé. Només és informatiu.</dd>
            <dt>Sessió canviada a mig escaneig</dt>
            <dd>La sessió activa ha canviat mentre es comprovava el codi; no s'ha desat.</dd>
            <dt>Sessió canviada (entrada ja desada)</dt>
            <dd>La sessió activa ha canviat, però l'entrada ja s'estava desant: compta a la sessió que era activa abans.</dd>
            <dt>Escaneig abandonat (pantalla tancada)</dt>
            <dd>S'ha sortit de la pantalla (o s'ha recarregat) mentre es comprovava un codi; no s'ha desat.</dd>
            <dt>Lector de QR no disponible</dt>
            <dd>El lector de QR no ha arrencat en aquest dispositiu i la pantalla ha passat a l'entrada manual.</dd>
          </dl>
        </>
      ),
    },
  ],
};
