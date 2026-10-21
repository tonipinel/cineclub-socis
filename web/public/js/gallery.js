document.querySelectorAll(".session-gallery").forEach(function (gallery) {
  var track = gallery.querySelector(".session-gallery__track");
  var prev = gallery.querySelector(".session-gallery__prev");
  var next = gallery.querySelector(".session-gallery__next");
  var dots = gallery.querySelectorAll(".session-gallery__dot");
  if (!track) return;

  function scrollByOne(direction) {
    var item = track.querySelector(".session-gallery__image");
    var amount = item ? item.getBoundingClientRect().width : track.clientWidth;
    track.scrollBy({ left: direction * amount, behavior: "smooth" });
  }

  if (prev) prev.addEventListener("click", function () { scrollByOne(-1); });
  if (next) next.addEventListener("click", function () { scrollByOne(1); });

  if (dots.length) {
    var images = track.querySelectorAll(".session-gallery__image");
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            var index = Array.prototype.indexOf.call(images, entry.target);
            dots.forEach(function (dot, i) {
              dot.classList.toggle("session-gallery__dot--active", i === index);
            });
          }
        });
      },
      { root: track, threshold: 0.6 }
    );
    images.forEach(function (img) { observer.observe(img); });
  }
});
