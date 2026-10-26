const routes = new Map();
let cleanup;
export function registerRoute(path, renderer) {
  routes.set(path, renderer);
}
export function startRouter() {
  async function render() {
    cleanup?.();
    cleanup = undefined;
    const path = (location.hash.slice(1) || "/").split("?")[0];
    const route = routes.has(path) ? path : "/";
    if (route !== path) {
      location.replace("#/");
      return;
    }
    document.querySelectorAll("[data-nav]").forEach((link) => {
      const active = link.dataset.nav === route;
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    document.body.classList.remove("menu-open");
    document
      .querySelector("#menu-button")
      ?.setAttribute("aria-expanded", "false");
    const main = document.querySelector("#main");
    main.replaceChildren();
    cleanup = routes.get(route)(main);
    main.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }
  window.addEventListener("hashchange", render);
  render();
}
