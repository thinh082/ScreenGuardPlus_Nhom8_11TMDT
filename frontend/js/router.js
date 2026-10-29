const routes = new Map();
let cleanup;
export function registerRoute(path, renderer) {
  routes.set(path, renderer);
}
export function startRouter() {
  async function render() {
    cleanup?.();
    cleanup = undefined;
    const path = (location.hash.slice(1) || "/scanner").split("?")[0];
    const route =
      path === "/" ? "/scanner" : routes.has(path) ? path : "/scanner";
    if (route !== path) {
      location.replace("#/scanner");
      return;
    }
    document
      .querySelectorAll("[data-nav], [data-mobile-nav]")
      .forEach((link) => {
        const active = (link.dataset.nav || link.dataset.mobileNav) === route;
        link.classList.toggle("active", active);
        if (active) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
      });
    document.body.classList.remove("menu-open");
    document
      .querySelector("#menu-button")
      ?.setAttribute("aria-expanded", "false");
    const main = document.querySelector("#main");
    main.className =
      route === "/scanner"
        ? "scanner-page"
        : route === "/overview"
          ? "overview-page"
          : "preferences-page";
    main.replaceChildren();
    cleanup = routes.get(route)(main);
    main.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }
  window.addEventListener("hashchange", render);
  render();
}
