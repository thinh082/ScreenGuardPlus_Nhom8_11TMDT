// Apply before CSS paints; keep this external to respect the app's CSP.
(() => {
  let theme;
  try {
    theme = localStorage.getItem("screenguard.theme");
  } catch {}
  if (!["light", "dark"].includes(theme))
    theme = matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]').content =
    theme === "dark" ? "#0d131d" : "#f5f7fa";
})();
