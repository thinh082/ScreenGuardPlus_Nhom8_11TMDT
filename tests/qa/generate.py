"""Generate authored fixtures for the browser acceptance test in ignored tmp/."""

from pathlib import Path
from tests.qa.corpus import CASES, Case, render

if __name__ == "__main__":
    folder = Path("tmp/pre-demo-fixtures")
    folder.mkdir(parents=True, exist_ok=True)
    for case in CASES:
        (folder / f"{case.id}.png").write_bytes(render(case)[0])
    acceptance = Case(
        "acceptance",
        "TC10",
        (
            "PS C:\\Demo>",
            "DATABASE_PASSWORD=DemoPass123!",
            "Email: privacy.test@example.com",
        ),
        ((1, "DB_CREDENTIAL"), (2, "EMAIL")),
        style="terminal",
    )
    (folder / "acceptance.png").write_bytes(render(acceptance)[0])
