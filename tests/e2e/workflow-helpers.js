export async function workflowStep(page, n) {
  if (
    !(await page
      .locator("#main")
      .evaluate((main) => main.classList.contains("has-image")))
  )
    return;
  await page.locator("#workflow-step-select").selectOption(String(n));
}
