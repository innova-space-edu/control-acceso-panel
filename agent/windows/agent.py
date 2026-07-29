"""Agente institucional de presencia y seguridad.

No captura teclado, cámara, micrófono, archivos personales ni historial de navegación.
Solo reporta estado técnico del equipo y ejecuta una lista cerrada de comandos.
"""

from __future__ import annotations

import ctypes
import getpass
import json
import os
import platform
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

VERSION = "1.0.0"
BASE_DIR = Path(os.environ.get("PROGRAMDATA", r"C:\ProgramData")) / "ControlAccesoAgent"
CONFIG_PATH = BASE_DIR / "config.json"
STATE_PATH = BASE_DIR / "state.json"
SIGNALS_DIR = BASE_DIR / "signals"
LOG_PATH = BASE_DIR / "agent.log"


def log(message: str) -> None:
    BASE_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().isoformat(timespec="seconds")
    with LOG_PATH.open("a", encoding="utf-8") as file:
        file.write(f"[{timestamp}] {message}\n")


def load_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def save_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)


def request_json(url: str, token: str, method: str = "GET", payload: dict[str, Any] | None = None, timeout: int = 20) -> dict[str, Any]:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": f"ControlAccesoAgent/{VERSION}",
        },
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def run_text(command: list[str], timeout: int = 8) -> str:
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=timeout, creationflags=0x08000000)
        return (result.stdout or "").strip()
    except Exception:
        return ""


def local_ip() -> str | None:
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("8.8.8.8", 80))
        value = sock.getsockname()[0]
        sock.close()
        return value
    except OSError:
        return None


def wifi_name() -> str | None:
    output = run_text(["netsh", "wlan", "show", "interfaces"])
    for line in output.splitlines():
        if "SSID" in line and "BSSID" not in line and ":" in line:
            return line.split(":", 1)[1].strip() or None
    return None


def battery_info() -> tuple[int | None, bool | None]:
    script = "(Get-CimInstance Win32_Battery | Select-Object EstimatedChargeRemaining,BatteryStatus | ConvertTo-Json -Compress)"
    output = run_text(["powershell", "-NoProfile", "-Command", script])
    try:
        data = json.loads(output)
        if isinstance(data, list):
            data = data[0] if data else {}
        level = int(data.get("EstimatedChargeRemaining")) if data.get("EstimatedChargeRemaining") is not None else None
        plugged = data.get("BatteryStatus") in (2, 6, 7, 8, 9, 11)
        return level, plugged
    except Exception:
        return None, None


def uptime_seconds() -> int | None:
    try:
        return int(ctypes.windll.kernel32.GetTickCount64() / 1000)
    except Exception:
        return None


def process_running(names: list[str]) -> bool:
    output = run_text(["tasklist", "/FO", "CSV", "/NH"])
    lowered = output.lower()
    return any(name.lower() in lowered for name in names)


def heartbeat_payload(config: dict[str, Any]) -> dict[str, Any]:
    battery, plugged = battery_info()
    return {
        "fecha_hora_dispositivo": datetime.now(timezone.utc).isoformat(),
        "hostname": socket.gethostname(),
        "usuario_sistema": getpass.getuser(),
        "ip_local": local_ip(),
        "red": wifi_name(),
        "sistema_operativo": f"{platform.system()} {platform.release()} ({platform.version()})",
        "version_agente": VERSION,
        "bateria": battery,
        "conectado_corriente": plugged,
        "tiempo_encendido_segundos": uptime_seconds(),
        "kiosk_activo": process_running(config.get("kiosk_processes", ["msedge.exe", "chrome.exe"])),
        "examen_activo": (SIGNALS_DIR / "exam_active.json").exists(),
        "datos": {
            "architecture": platform.machine(),
            "python": platform.python_version(),
        },
    }


def signal(name: str, payload: dict[str, Any]) -> None:
    SIGNALS_DIR.mkdir(parents=True, exist_ok=True)
    save_json(SIGNALS_DIR / f"{name}.json", {"received_at": datetime.now(timezone.utc).isoformat(), **payload})


def lock_workstation() -> None:
    ctypes.windll.user32.LockWorkStation()


def execute_command(command: dict[str, Any]) -> tuple[str, str]:
    command_type = str(command.get("tipo", ""))
    payload = command.get("payload") if isinstance(command.get("payload"), dict) else {}

    # Lista cerrada: nunca se ejecuta código o shell recibido desde internet.
    if command_type == "desbloquear":
        signal("unlock", payload)
        return "ejecutado", "Señal de desbloqueo almacenada para el kiosco"
    if command_type == "bloquear":
        signal("lock", payload)
        lock_workstation()
        return "ejecutado", "Estación de trabajo bloqueada"
    if command_type == "cerrar_sesion":
        signal("close_session", payload)
        return "ejecutado", "Señal de cierre enviada al kiosco"
    if command_type == "iniciar_examen":
        signal("exam_active", payload)
        return "ejecutado", "Modo examen activado"
    if command_type == "cerrar_examen":
        path = SIGNALS_DIR / "exam_active.json"
        if path.exists():
            path.unlink()
        signal("exam_closed", payload)
        return "ejecutado", "Modo examen cerrado"
    if command_type == "modo_robado":
        signal("stolen_mode", payload)
        lock_workstation()
        return "ejecutado", "Modo robado activado y estación bloqueada"
    if command_type == "reiniciar_agente":
        signal("agent_restart", payload)
        return "ejecutado", "Agente reiniciándose"
    return "fallido", f"Comando no permitido: {command_type}"


def main() -> int:
    config = load_json(CONFIG_PATH, {})
    panel_url = str(config.get("panel_url", "")).rstrip("/")
    token = str(config.get("token", ""))
    if not panel_url or not token:
        log(f"Configuración incompleta en {CONFIG_PATH}")
        return 2

    state = load_json(STATE_PATH, {"heartbeat_seconds": 120, "offline_queue": []})
    while True:
        restart = False
        try:
            payload = heartbeat_payload(config)
            heartbeat = request_json(f"{panel_url}/api/agent/heartbeat", token, "POST", payload)
            state["heartbeat_seconds"] = int(heartbeat.get("heartbeat_seconds", 120))
            state["last_success"] = datetime.now(timezone.utc).isoformat()
            state["last_error"] = None

            commands_response = request_json(f"{panel_url}/api/agent/commands", token)
            for command in commands_response.get("commands", []):
                try:
                    status, detail = execute_command(command)
                except Exception as exc:
                    status, detail = "fallido", f"Error local: {exc}"
                request_json(
                    f"{panel_url}/api/agent/commands",
                    token,
                    "POST",
                    {"command_id": command.get("id"), "status": status, "detail": detail},
                )
                log(f"Comando {command.get('tipo')} {status}: {detail}")
                if command.get("tipo") == "reiniciar_agente" and status == "ejecutado":
                    restart = True

            save_json(STATE_PATH, state)
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            state["last_error"] = str(exc)
            state["last_attempt"] = datetime.now(timezone.utc).isoformat()
            save_json(STATE_PATH, state)
            log(f"Sin conexión con el panel: {exc}")
        except Exception as exc:
            state["last_error"] = str(exc)
            save_json(STATE_PATH, state)
            log(f"Error no controlado: {exc}")

        if restart:
            return 0
        time.sleep(max(30, min(600, int(state.get("heartbeat_seconds", 120)))))


if __name__ == "__main__":
    sys.exit(main())
