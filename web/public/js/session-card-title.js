document.querySelectorAll(".session-card__title").forEach(function (title) {
  if (title.textContent.trim().length > 30) {
    title.classList.add("session-card__title--long");
  }
});
