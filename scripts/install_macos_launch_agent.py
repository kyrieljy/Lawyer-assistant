import os
import plistlib
import sys
from pathlib import Path


def main():
    if sys.platform != "darwin":
        raise SystemExit("This installer must be run on macOS.")
    app_name = "律师案件进度助手"
    label = "cn.local.lawyer-case-assistant.reminders"
    home = Path.home()
    launch_agents = home / "Library" / "LaunchAgents"
    launch_agents.mkdir(parents=True, exist_ok=True)
    plist_path = launch_agents / f"{label}.plist"

    app_backend = Path("/Applications") / f"{app_name}.app" / "Contents" / "Resources" / "backend-dist" / "mac" / "backend"
    if app_backend.exists():
        program_arguments = [str(app_backend), "checkReminders"]
    else:
        project_backend = Path(__file__).resolve().parent / "backend.py"
        program_arguments = [sys.executable, str(project_backend), "checkReminders"]

    data_dir = home / "Library" / "Application Support" / app_name
    plist = {
        "Label": label,
        "ProgramArguments": program_arguments,
        "EnvironmentVariables": {
            "LAWYER_ASSISTANT_DATA_DIR": str(data_dir),
            "PYTHONIOENCODING": "utf-8",
        },
        "StartCalendarInterval": [
            {"Hour": 9, "Minute": 0},
            {"Hour": 12, "Minute": 0},
            {"Hour": 18, "Minute": 0},
        ],
        "RunAtLoad": True,
        "StandardOutPath": str(data_dir / "reminder-launchagent.log"),
        "StandardErrorPath": str(data_dir / "reminder-launchagent.err.log"),
    }
    data_dir.mkdir(parents=True, exist_ok=True)
    plist_path.write_bytes(plistlib.dumps(plist))
    os.system(f"launchctl unload {plist_path} >/dev/null 2>&1")
    code = os.system(f"launchctl load {plist_path}")
    if code != 0:
        raise SystemExit(f"LaunchAgent plist written but launchctl load failed: {plist_path}")
    print(f"Installed LaunchAgent: {plist_path}")


if __name__ == "__main__":
    main()
