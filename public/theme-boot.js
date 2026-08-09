(function () {
  var t = localStorage.getItem("wrong-answer-theme");
  var dark =
    t === "dark" ||
    (t !== "light" &&
      (t === "system"
        ? matchMedia("(prefers-color-scheme: dark)").matches
        : true));
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
})();
