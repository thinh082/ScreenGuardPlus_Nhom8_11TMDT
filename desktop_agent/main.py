"""python -m desktop_agent.main: the existing PWA/API plus an opt-in Windows agent."""
import argparse
import os


def main():
    parser = argparse.ArgumentParser(description="ScreenGuard+ Windows Screenshot Companion (loopback only)")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--folder", help="Explicitly authorize this local Screenshots directory")
    parser.add_argument("--enable", action="store_true", help="Enable monitoring the explicitly authorized folder")
    parser.add_argument("--settings-file", help="Override the per-user consent/preferences file")
    args = parser.parse_args()
    if os.name != "nt":
        parser.error("The desktop companion requires Windows 10/11. The regular PWA remains available.")
    if not 1 <= args.port <= 65535:
        parser.error("Port must be between 1 and 65535")
    from desktop_agent.controller import Companion
    from desktop_agent.settings import allowed_folder, save_settings
    from backend.main import create_app
    import uvicorn
    url = f"http://127.0.0.1:{args.port}"
    agent = Companion(url, path=args.settings_file)
    try:
        if args.folder:
            agent.settings.folder = str(allowed_folder(args.folder))
            agent.settings.enabled = bool(args.enable)
            save_settings(agent.path, agent.settings)
        elif args.enable and not agent.settings.folder:
            parser.error("Use --folder with --enable, or first select a folder in Settings")
        elif args.enable:
            agent.settings.enabled = True
            save_settings(agent.path, agent.settings)
    except (ValueError, OSError):
        parser.error("Cannot use the selected local folder or save consent preferences")
    print(f"ScreenGuard+ Companion: {url} — Ctrl+C stops agent and backend.")
    # Never expose screenshot review or controls to the LAN; never log URLs/bodies.
    uvicorn.run(create_app(agent), host="127.0.0.1", port=args.port, access_log=False, proxy_headers=False, workers=1)


if __name__ == "__main__":
    main()
