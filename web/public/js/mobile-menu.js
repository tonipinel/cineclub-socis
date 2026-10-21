(function () {
  var menu = document.querySelector("[data-mobile-menu]");
  var toggle = document.querySelector("[data-menu-toggle]");
  if (!menu || !toggle) return;

  var closeButtons = menu.querySelectorAll("[data-menu-close]");
  var links = menu.querySelectorAll("a");

  function openMenu() {
    menu.setAttribute("data-open", "true");
    toggle.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
  }

  function closeMenu() {
    menu.setAttribute("data-open", "false");
    toggle.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
  }

  toggle.addEventListener("click", openMenu);
  closeButtons.forEach(function (btn) {
    btn.addEventListener("click", closeMenu);
  });
  links.forEach(function (link) {
    link.addEventListener("click", closeMenu);
  });
})();
