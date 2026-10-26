"""
Monitor Dual de Contenedores y Latido Externo (Watchdog) - Despensa Snoopy (Fiados)
-----------------------------------------------------------------------------------
1. Vigila el estado de los contenedores Docker locales (/var/run/docker.sock) y el
   endpoint /api/health de la aplicación.
2. Si un contenedor se cae pero la PC sigue encendida, envía una alerta inmediata
   a Discord o Slack por Webhook indicando exactamente qué contenedor falló.
3. Envía un latido (Heartbeat / Dead Man's Switch) periódico a un servicio externo
   (ej. Healthchecks.io). Si la PC se apaga o se corta la luz/internet, el servicio
   externo deja de recibir el latido y dispara la alerta de "PC Apagada / Sin Internet".
"""

import argparse
import http.client
import json
import os
import socket
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Zona horaria oficial de Argentina (UTC-3)
TZ_ARGENTINA = timezone(timedelta(hours=-3))


def cargar_env_local() -> None:
    """Carga variables desde el archivo .env si se ejecuta fuera de Docker."""
    posibles_envs = [
        Path(__file__).resolve().parent.parent / ".env",
        Path.cwd() / ".env",
    ]
    for env_path in posibles_envs:
        if env_path.exists():
            for raw_line in env_path.read_text(encoding="utf-8", errors="ignore").splitlines():
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = value
            break


class UnixSocketHTTPConnection(http.client.HTTPConnection):
    """Conexión HTTP sobre el socket Unix de Docker (/var/run/docker.sock)."""

    def __init__(self, socket_path: str, timeout: int = 5):
        super().__init__("localhost", timeout=timeout)
        self.socket_path = socket_path

    def connect(self) -> None:
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect(self.socket_path)


def ahora_str() -> str:
    return datetime.now(TZ_ARGENTINA).strftime("%d/%m/%Y %H:%M:%S")


def obtener_contenedores_docker(socket_path: str = "/var/run/docker.sock") -> dict[str, dict] | None:
    """
    Consulta la API del motor Docker local y devuelve un diccionario
    { nombre_contenedor: {"state": ..., "status": ..., "healthy": bool, "detalle": ...} }.
    Devuelve None si el socket no está disponible.
    """
    if not hasattr(socket, "AF_UNIX") or not os.path.exists(socket_path):
        return None

    try:
        conn = UnixSocketHTTPConnection(socket_path, timeout=5)
        conn.request("GET", "/containers/json?all=1")
        resp = conn.getresponse()
        if resp.status != 200:
            conn.close()
            return None
        raw_data = resp.read().decode("utf-8")
        conn.close()
        containers = json.loads(raw_data)
    except Exception as exc:
        print(f"[{ahora_str()}] [WARN] No se pudo consultar Docker socket: {exc}", flush=True)
        return None

    resultado: dict[str, dict] = {}
    for c in containers:
        names = c.get("Names") or []
        for raw_name in names:
            name = raw_name.lstrip("/")
            state = (c.get("State") or "unknown").lower()
            status_text = c.get("Status") or state
            # Detectar si el healthcheck de Docker reporta unhealthy
            es_unhealthy = "(unhealthy)" in status_text.lower()
            esta_sano = (state == "running") and not es_unhealthy
            resultado[name] = {
                "state": state,
                "status": status_text,
                "healthy": esta_sano,
            }
    return resultado


def verificar_api_health(url: str, timeout: int = 5) -> tuple[bool, str]:
    """Verifica el endpoint HTTP /api/health de la app FastAPI."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "FiadosWatchdog/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8", errors="ignore")
            if resp.status == 200:
                return True, "HTTP 200 OK (App + DB operativas)"
            return False, f"HTTP {resp.status}: {body[:120]}"
    except urllib.error.HTTPError as http_err:
        body = http_err.read().decode("utf-8", errors="ignore")
        return False, f"HTTP {http_err.code} (Fallo interno/DB): {body[:120]}"
    except Exception as exc:
        return False, f"Sin respuesta en {url} ({exc})"


def enviar_webhook(
    webhook_url: str,
    titulo: str,
    descripcion: str,
    color_hex: int = 0xE74C3C,
    campos: list[tuple[str, str]] | None = None,
) -> bool:
    """
    Envía una alerta a Discord o Slack mediante Webhook.
    Detecta automáticamente el formato según la URL.
    """
    if not webhook_url or webhook_url.startswith("pegar_aqui"):
        print(f"[{ahora_str()}] [INFO] Alerta generada (sin webhook configurado): {titulo} - {descripcion}", flush=True)
        return False

    es_discord = "discord.com/api/webhooks" in webhook_url or "discordapp.com/api/webhooks" in webhook_url
    lineas_resumen = [f"**{titulo}**", descripcion]
    if campos:
        for nombre, valor in campos:
            lineas_resumen.append(f"• **{nombre}:** {valor}")
    line_text = "\n".join(lineas_resumen)

    if es_discord:
        embed: dict = {
            "title": titulo,
            "description": descripcion,
            "color": color_hex,
            "footer": {"text": f"Monitor Despensa Snoopy • {ahora_str()} (ARG)"},
        }
        if campos:
            embed["fields"] = [{"name": k, "value": v, "inline": False} for k, v in campos]
        payload = {
            "username": "Monitor Fiados Snoopy",
            "embeds": [embed],
        }
    else:
        # Formato compatible con Slack / Mattermost / genérico
        payload = {"text": f"{line_text}\n_Hora (ARG): {ahora_str()}_"}

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        webhook_url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "FiadosWatchdog/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return 200 <= resp.status < 300
    except Exception as exc:
        print(f"[{ahora_str()}] [ERROR] Falló envío de Webhook: {exc}", flush=True)
        return False


def enviar_heartbeat(heartbeat_url: str, exito: bool = True) -> bool:
    """
    Envía un latido (ping) al servicio externo (ej. Healthchecks.io / BetterStack / Uptime Kuma).
    Si la PC se apaga o pierde internet, este ping deja de llegar y el servicio externo alerta.
    """
    if not heartbeat_url or heartbeat_url.startswith("pegar_aqui"):
        return False

    target_url = heartbeat_url.rstrip("/")
    if not exito and "hc-ping.com" in target_url:
        target_url = f"{target_url}/fail"

    try:
        req = urllib.request.Request(target_url, headers={"User-Agent": "FiadosWatchdog/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            return 200 <= resp.status < 300
    except Exception as exc:
        print(f"[{ahora_str()}] [WARN] No se pudo enviar heartbeat externo a {target_url}: {exc}", flush=True)
        return False


def lista_contenedores_monitoreados() -> list[str]:
    """Determina qué contenedores vigilar según las variables de entorno."""
    custom = os.getenv("MONITORED_CONTAINERS", "").strip()
    if custom:
        return [c.strip() for c in custom.split(",") if c.strip()]

    base = ["fiados_app", "fiados_db", "fiados_backups"]
    tunnel_token = os.getenv("CLOUDFLARE_TUNNEL_TOKEN", "").strip()
    if tunnel_token and not tunnel_token.startswith("pegar_aqui"):
        base.append("fiados_tunnel")
    return base


def ejecutar_ciclo(
    estado_previo: dict[str, bool],
    webhook_url: str,
    heartbeat_url: str,
    app_health_url: str,
    socket_path: str,
) -> bool:
    """
    Ejecuta una verificación completa de contenedores y API.
    Envía alertas solo cuando hay un cambio de estado (caída o recuperación).
    Devuelve True si todo el sistema está sano.
    """
    contenedores_objetivo = lista_contenedores_monitoreados()
    docker_info = obtener_contenedores_docker(socket_path)
    todo_sano = True

    if docker_info is not None:
        for nombre in contenedores_objetivo:
            info = docker_info.get(nombre)
            if info is None:
                sano_actual = False
                detalle = "No encontrado (el contenedor no existe o fue eliminado)"
            else:
                sano_actual = info["healthy"]
                detalle = f"Estado: `{info['state']}` ({info['status']})"

            if not sano_actual:
                todo_sano = False

            estaba_sano = estado_previo.get(nombre, True)
            if estaba_sano and not sano_actual:
                enviar_webhook(
                    webhook_url=webhook_url,
                    titulo=f"🚨 Contenedor Caído: {nombre}",
                    descripcion=(
                        "La computadora del local **sigue encendida y con internet**, "
                        f"pero el contenedor `{nombre}` dejó de funcionar correctamente."
                    ),
                    color_hex=0xE74C3C,
                    campos=[
                        ("Contenedor afectado", f"`{nombre}`"),
                        ("Detalle de Docker", detalle),
                        ("Diagnóstico", "Caída de contenedor (Host encendido)"),
                        ("Acción sugerida", f"Ejecutar `docker compose restart {nombre.replace('fiados_', '')}` o revisar `docker logs {nombre}`"),
                    ],
                )
            elif not estaba_sano and sano_actual:
                enviar_webhook(
                    webhook_url=webhook_url,
                    titulo=f"✅ Contenedor Recuperado: {nombre}",
                    descripcion=f"El contenedor `{nombre}` volvió a estar operativo.",
                    color_hex=0x2ECC71,
                    campos=[
                        ("Contenedor", f"`{nombre}`"),
                        ("Detalle de Docker", detalle),
                    ],
                )

            estado_previo[nombre] = sano_actual

    # Verificar endpoint /api/health (valida FastAPI + consulta SELECT 1 a PostgreSQL)
    if app_health_url:
        api_ok, api_detalle = verificar_api_health(app_health_url)
        if not api_ok:
            todo_sano = False

        estaba_api_ok = estado_previo.get("endpoint_api_health", True)
        if estaba_api_ok and not api_ok:
            enviar_webhook(
                webhook_url=webhook_url,
                titulo="⚠️ Fallo en Endpoint de Salud (/api/health)",
                descripcion=(
                    "La aplicación web o la conexión con la base de datos PostgreSQL "
                    "no está respondiendo correctamente."
                ),
                color_hex=0xE67E22,
                campos=[
                    ("Endpoint", f"`{app_health_url}`"),
                    ("Respuesta", api_detalle),
                ],
            )
        elif not estaba_api_ok and api_ok:
            enviar_webhook(
                webhook_url=webhook_url,
                titulo="✅ Endpoint de Salud Recuperado (/api/health)",
                descripcion="La aplicación FastAPI y la base de datos PostgreSQL responden con normalidad.",
                color_hex=0x2ECC71,
                campos=[
                    ("Endpoint", f"`{app_health_url}`"),
                    ("Respuesta", api_detalle),
                ],
            )
        estado_previo["endpoint_api_health"] = api_ok

    # Enviar latido al Dead Man's Switch externo (Healthchecks.io / Uptime Kuma)
    if heartbeat_url:
        enviar_heartbeat(heartbeat_url, exito=todo_sano)

    return todo_sano


def main() -> int:
    cargar_env_local()

    parser = argparse.ArgumentParser(description="Watchdog de contenedores y latido externo para Fiados")
    parser.add_argument(
        "--test-webhook",
        action="store_true",
        help="Envía un mensaje de prueba al Webhook de Discord/Slack y termina.",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Ejecuta una sola comprobación y termina.",
    )
    args = parser.parse_args()

    webhook_url = os.getenv("MONITOR_WEBHOOK_URL", "").strip()
    heartbeat_url = os.getenv("HEARTBEAT_URL", "").strip()
    app_health_url = os.getenv("APP_HEALTH_URL", "http://app:8000/api/health").strip()
    socket_path = os.getenv("DOCKER_SOCKET_PATH", "/var/run/docker.sock").strip()
    interval = int(os.getenv("MONITOR_INTERVAL_SECONDS", "30"))
    notify_startup = os.getenv("MONITOR_NOTIFY_ON_STARTUP", "true").lower() in ("true", "1", "yes", "si")

    if args.test_webhook:
        if not webhook_url or webhook_url.startswith("pegar_aqui"):
            print("❌ Error: Debes configurar MONITOR_WEBHOOK_URL en tu archivo .env primero.")
            return 1
        print(f"Enviando alerta de prueba al webhook configurado...")
        ok = enviar_webhook(
            webhook_url=webhook_url,
            titulo="🔔 Prueba de Monitoreo - Despensa Snoopy",
            descripcion=(
                "¡El canal de alertas funciona correctamente! "
                "Recibirás notificaciones aquí si algún contenedor (`fiados_app`, `fiados_db`, `fiados_backups`) se cae."
            ),
            color_hex=0x3498DB,
            campos=[
                ("Contenedores vigilados", ", ".join(f"`{c}`" for c in lista_contenedores_monitoreados())),
                ("Heartbeat externo", "Configurado ✅" if (heartbeat_url and not heartbeat_url.startswith("pegar_aqui")) else "Pendiente de configurar en .env"),
            ],
        )
        if ok:
            print("✅ Mensaje de prueba enviado con éxito a Discord/Slack.")
            return 0
        print("❌ No se pudo enviar el mensaje de prueba. Verifica la URL del Webhook.")
        return 1

    print(
        f"[{ahora_str()}] Iniciando Watchdog de Fiados | "
        f"Contenedores: {lista_contenedores_monitoreados()} | Intervalo: {interval}s",
        flush=True,
    )

    if notify_startup and webhook_url and not webhook_url.startswith("pegar_aqui") and not args.once:
        enviar_webhook(
            webhook_url=webhook_url,
            titulo="🟢 Monitor de Contenedores Iniciado",
            descripcion="La PC del local está encendida y el servicio `fiados_watchdog` comenzó a monitorear los contenedores.",
            color_hex=0x2ECC71,
            campos=[
                ("Contenedores vigilados", ", ".join(f"`{c}`" for c in lista_contenedores_monitoreados())),
                ("Intervalo de chequeo", f"Cada {interval} segundos"),
            ],
        )

    estado_previo: dict[str, bool] = {}

    if args.once:
        sano = ejecutar_ciclo(estado_previo, webhook_url, heartbeat_url, app_health_url, socket_path)
        return 0 if sano else 1

    # Pequeña espera inicial para dar tiempo a que fiados_app termine de levantar
    time.sleep(5)

    while True:
        try:
            ejecutar_ciclo(estado_previo, webhook_url, heartbeat_url, app_health_url, socket_path)
        except Exception as exc:
            print(f"[{ahora_str()}] [ERROR] Excepción en ciclo del watchdog: {exc}", flush=True)
        time.sleep(interval)


if __name__ == "__main__":
    sys.exit(main())
