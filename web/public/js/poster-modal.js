document.querySelectorAll("[data-poster-trigger]").forEach(function (trigger) {
  var dialog = document.getElementById(trigger.getAttribute("data-poster-trigger"));
  if (!dialog) return;
  trigger.addEventListener("click", function () {
    dialog.showModal();
  });
});

document.querySelectorAll("dialog.poster-modal").forEach(function (dialog) {
  var closeBtn = dialog.querySelector(".poster-modal__close");
  if (closeBtn) closeBtn.addEventListener("click", function () { dialog.close(); });
  dialog.addEventListener("click", function (e) {
    if (e.target === dialog) dialog.close();
  });
});
