# Despensa Snoopy - Sistema de Cuentas Corrientes y Libreta de Fiados

Aplicación Web Progresiva (**PWA**) y monolito modular diseñada para reemplazar el fichero físico de hojas de papel donde se anotan las compras fiadas mensuales en la despensa.

Permite operar en simultáneo desde múltiples celulares (Android / iPhone) y desde la PC del mostrador de forma ultra-rápida (menos de 5 segundos por carga).

---

## 🎯 Reglas de Negocio y Arquitectura Contable

1. **Patrón Contable Append-Only Ledger (Libro Mayor Inmutable):**
   - No se edita ni se borra ningún movimiento anterior.
   - Todo monto y saldo se almacena en base de datos como `NUMERIC(12, 2)` y se opera con `Decimal` en Python, evitando cualquier error de coma flotante (`FLOAT`).
2. **Concurrencia y Bloqueo Pesimista:**
   - La actualización del `saldo_actual` y registro de movimientos utiliza `SELECT ... FOR UPDATE` (`with_for_update()`) en PostgreSQL para evitar condiciones de carrera entre los operadores simultáneos.
3. **Anulación Atómica con Contra-asientos:**
   - Si un operador se equivoca, el movimiento original se marca `anulado = True` (visible tachado en el historial con detalle de quién y cuándo lo anuló).
   - Se crea atómicamente un contra-asiento inmutable (`ANULACION_CARGO` o `ANULACION_PAGO`) que revierte el saldo del cliente.
4. **Zona Horaria Oficial Argentina (UTC-3):**
   - Todas las anotaciones, fechas de movimientos, resúmenes y emisiones de Excel se procesan y registran con la hora local oficial de Argentina (`America/Argentina/Buenos_Aires`), evitando desfasajes de servidor en UTC.
5. **"Regla de los 3 Toques" (< 5 segundos en mostrador):**
   - **Toque 1:** Seleccionar cliente (o búsqueda instantánea por nombre o apodo).
   - **Toque 2:** Tocar `+ Fiado` o `Cobrar` (con montos preconfigurados: `+$1.000`, `+$2.000`, `+$5.000`, `+$10.000`, etc. y notas rápidas).
   - **Toque 3:** Confirmar asiento.
6. **Gestión de Clientes (Habilitar / Deshabilitar):**
   - Si un cliente tiene la cuenta pausada o inactiva, se puede deshabilitar con 1 clic. El sistema bloquea de inmediato la carga de fiados y cobros tanto en la interfaz como a nivel de base de datos.
7. **Resumen de Cuenta para WhatsApp (+54):**
   - Números de teléfono normalizados automáticamente al estándar internacional de telefonía móvil de Argentina (`+54 9 ...`).
   - Cálculo del estado de cuenta mensual (`YYYY-MM`) y mensaje formateado listo para enviar por WhatsApp en 1 clic.
8. **Exportación Contable a Excel (.xlsx):**
   - Descarga en 1 clic del libro mayor del cliente (historial completo o filtrado por mes) con formato monetario profesional en pesos argentinos (`$ #,##0.00`).

---

## 🔑 Inicialización y Primer Acceso

Al inicializar la base de datos por primera vez, el sistema **no precarga usuarios ficticios**, sino que crea únicamente el usuario administrador inicial:

- **Operador:** `Administrador`
- **PIN:** `1111`
- **Rol:** Administrador del sistema

### Cómo gestionar operadores:
1. Inicie sesión ingresando el PIN `1111`.
2. En la barra superior, toque el botón **"Operadores"**.
3. Podrá dar de alta a los demás miembros de la familia o cajeros asignándoles su nombre y un PIN de 4 dígitos.
4. **Eliminar operadores:** Si un operador nunca registró movimientos, se elimina por completo; si ya tiene asientos contables registrados en el libro mayor, se da de baja lógica (`activo = False`) para no romper la auditoría de la libreta.

---

## 🚀 Cómo Levantar la App en el Servidor / PC del Local

### Opción 1: Con Docker Compose (Recomendado para Producción)

Es la forma más robusta y aislada. Levanta el monolito FastAPI + Frontend React compilado + Base de datos PostgreSQL 16 + Backups diarios automáticos:

1. **Configurar el archivo `.env`:**
   ```bash
   cp .env.example .env
   ```

2. **Levantar los contenedores:**
   ```bash
   docker compose up -d --build
   ```

3. **Verificar que todo esté corriendo:**
   ```bash
   docker compose ps
   ```

La aplicación estará lista y accesible en el puerto `8000`.

---

### Opción 2: Sin Docker (Modo Desarrollo Local)

Si desea ejecutarlo directamente en Windows / Linux sin contenedores:

#### 1. Backend (FastAPI):
```powershell
# En la raíz del proyecto
$env:PYTHONPATH="backend"
backend\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
> En Linux / macOS reemplace por `source backend/.venv/bin/activate` y `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`.

#### 2. Frontend (React + Vite):
```powershell
cd frontend
npm.cmd run dev -- --host
```

---

## 📱 Cómo Acceder desde el Celular (Smartphone)

Puede operar la libreta desde cualquier teléfono Android o iPhone de dos maneras:

---

### Método A: En el Local Comercial conectado al Wi-Fi (Red Local LAN)

> 💡 **Ventaja:** ¡Funciona incluso si se cae el proveedor de internet en el barrio! La despensa sigue cobrando y anotando en la red interna del local.

#### Paso 1: Averiguar la IP local de la PC o servidor del local
En la computadora donde corre la app:
- **Windows:** Abra la terminal (PowerShell o CMD) y escriba:
  ```powershell
  ipconfig
  ```
  Busque la línea **Dirección IPv4** de su conexión Wi-Fi o Ethernet (por ejemplo: `192.168.1.45` o `192.168.0.100`).
- **Linux / Mac:** Ejecute `ip a` o `ifconfig`.

#### Paso 2: Conectar el teléfono a la misma red Wi-Fi
Asegúrese de que el celular esté conectado a la misma red Wi-Fi del comercio que la PC.

#### Paso 3: Abrir el navegador en el teléfono
En Google Chrome, Safari o su navegador favorito del teléfono, escriba:
```text
http://<IP-DE-LA-PC>:8000
```
*(Por ejemplo: `http://192.168.1.45:8000`)*

#### ⚠️ Nota sobre el Firewall de Windows:
Si el celular no carga la página, asegúrese de que el Firewall de Windows permita conexiones entrantes al puerto 8000. Puede habilitarlo en PowerShell como Administrador con:
```powershell
New-NetFirewallRule -DisplayName "Libreta Fiados" -Direction Inbound -LocalPort 8000 -Protocol TCP -Action Allow
```

---

### Método B: Acceso Remoto desde cualquier lugar (4G / Datos Móviles) con Cloudflare Tunnel

Si los dueños de la despensa quieren consultar saldos o anotar fiados cuando están fuera del local (con datos móviles 4G/5G):

1. El archivo `docker-compose.yml` ya incluye el servicio opcional `tunnel` (Cloudflare Tunnel).
2. Cree un túnel gratuito en [Cloudflare Zero Trust](https://one.dash.cloudflare.com/) apuntando a `http://app:8000`.
3. Copie el token del túnel en su `.env`:
   ```env
   CLOUDFLARE_TUNNEL_TOKEN=eyJhIjoi...
   ```
4. Descomente el servicio `tunnel` en `docker-compose.yml` y ejecute:
   ```bash
   docker compose up -d
   ```
5. Podrá ingresar desde cualquier celular en cualquier parte del mundo con su dominio seguro HTTPS (por ejemplo `https://fiados.mitienda.com`) **sin abrir puertos en el módem**.

---

### 📲 Cómo Instalar la App en el Celular como PWA (App Nativa)

Para que la libreta funcione a pantalla completa y con un toque directo desde el escritorio del teléfono (sin ver la barra del navegador):

- **En Android (Google Chrome):**
  1. Ingrese a la dirección de la app (`http://<IP>:8000` o su dominio).
  2. Toque los tres puntos **⋮** arriba a la derecha.
  3. Seleccione **"Instalar aplicación"** o **"Agregar a la pantalla principal"**.
  4. Se creará el ícono **"Libreta de Fiados"** en su pantalla de inicio.

- **En iPhone / iOS (Safari):**
  1. Abra la página en **Safari**.
  2. Toque el botón **Compartir** (el ícono del cuadrado con la flecha hacia arriba en la barra inferior).
  3. Deslice hacia abajo y toque **"Agregar al inicio"** (Add to Home Screen).
  4. Toque **"Agregar"**.

---

## 💾 Backups Automáticos

El contenedor `fiados_backups` realiza copias de seguridad automáticas de la base de datos PostgreSQL diariamente:
- Directorio de destino en el servidor: `./backups/`
- Retención configurada:
  - 14 copias diarias
  - 4 copias semanales
  - 6 copias mensuales

Para realizar un backup manual en cualquier momento:
```bash
docker exec -t fiados_db pg_dump -U postgres fiados > backups/backup_manual_$(date +%Y%m%d).sql
```

---

## 🧪 Tests del Sistema

El proyecto cuenta con una suite completa de pruebas unitarias y de integración que verifica la concurrencia contable, la inmutabilidad del ledger, los cálculos en pesos argentinos y las exportaciones a Excel:

```powershell
$env:PYTHONPATH="backend"
backend\.venv\Scripts\python.exe -m pytest backend/tests/test_backend.py -v
```
