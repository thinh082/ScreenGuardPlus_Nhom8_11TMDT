const KEY = "screenguard.theme";
const preference = matchMedia("(prefers-color-scheme: dark)");
function savedTheme() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
export function getTheme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}
function apply(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]').content =
    theme === "dark" ? "#0d131d" : "#f5f7fa";
  window.dispatchEvent(new Event("themechange"));
}
export function toggleTheme() {
  const theme = getTheme() === "dark" ? "light" : "dark";
  try {
    localStorage.setItem(KEY, theme);
  } catch {}
  apply(theme);
}
preference.addEventListener("change", (event) => {
  if (!["light", "dark"].includes(savedTheme()))
    apply(event.matches ? "dark" : "light");
});
window.addEventListener("storage", (event) => {
  if (event.key === KEY)
    apply(
      ["light", "dark"].includes(event.newValue)
        ? event.newValue
        : preference.matches
          ? "dark"
          : "light",
    );
});
