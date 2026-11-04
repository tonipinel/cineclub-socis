(function () {
  var titols = document.querySelectorAll(".session-card__title");
  if (!titols.length) return;

  // Els títols de més de 30 caràcters ja surten més petits (a la mida --long).
  titols.forEach(function (titol) {
    if (titol.textContent.trim().length > 30) {
      titol.classList.add("session-card__title--long");
    }
  });

  // Si una paraula no hi cap (p. ex. «Mediterranean»), es redueix la lletra d'aquell títol fins que hi capiga.
  var MIDA_MINIMA = 16;
  function ajusta() {
    titols.forEach(function (titol) {
      titol.style.fontSize = "";
      if (!titol.clientWidth) return;
      var mida = parseFloat(getComputedStyle(titol).fontSize);
      while (titol.scrollWidth > titol.clientWidth && mida > MIDA_MINIMA) {
        mida -= 1;
        titol.style.fontSize = mida + "px";
      }
    });
  }

  ajusta();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(ajusta);
  var temporitzador;
  window.addEventListener("resize", function () {
    clearTimeout(temporitzador);
    temporitzador = setTimeout(ajusta, 150);
  });
})();
