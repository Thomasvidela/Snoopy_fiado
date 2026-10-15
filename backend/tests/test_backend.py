import pytest
from decimal import Decimal
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.seed import seed_database
from app.models import TipoMovimiento

# Base de datos SQLite en memoria para tests aislados
TEST_DATABASE_URL = "sqlite:///./test_fiados.db"
test_engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(scope="module", autouse=True)
def setup_database():
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)
    db = TestingSessionLocal()
    seed_database(db)
    db.close()
    yield
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def client():
    return TestClient(app)


def test_auth_operadores_y_login(client):
    # 1. Sin clave del local, el listado de operadores debe ser denegado (401)
    resp_sin_clave = client.get("/api/auth/operadores")
    assert resp_sin_clave.status_code == 401
    assert "Dispositivo no autorizado" in resp_sin_clave.json()["detail"]

    # 2. Verificar clave del comercio incorrecta vs correcta
    resp_bad_key = client.post("/api/auth/verificar-clave-local", json={"clave": "clave_incorrecta"})
    assert resp_bad_key.status_code == 401

    resp_good_key = client.post("/api/auth/verificar-clave-local", json={"clave": "Despensa.Snoopy1980"})
    assert resp_good_key.status_code == 200

    # 3. Listar operadores con clave del local
    resp = client.get("/api/auth/operadores", headers={"x-store-key": "Despensa.Snoopy1980"})
    assert resp.status_code == 200
    operadores = resp.json()
    assert len(operadores) == 1
    admin = operadores[0]
    assert admin["nombre"] == "Administrador"
    assert admin["es_admin"] is True

    # 4. Login sin clave del local debe fallar (401)
    resp_login_sin_clave = client.post("/api/auth/login", json={"usuario_id": admin["id"], "pin": "1111"})
    assert resp_login_sin_clave.status_code == 401
    assert "Dispositivo no autorizado" in resp_login_sin_clave.json()["detail"]

    store_headers = {"x-store-key": "Despensa.Snoopy1980"}

    # 5. Login con PIN incorrecto
    resp_fail = client.post("/api/auth/login", json={"usuario_id": admin["id"], "pin": "9999"}, headers=store_headers)
    assert resp_fail.status_code == 401

    # 6. Login con PIN correcto (1111)
    resp_ok = client.post("/api/auth/login", json={"usuario_id": admin["id"], "pin": "1111"}, headers=store_headers)
    assert resp_ok.status_code == 200
    token_data = resp_ok.json()
    assert "access_token" in token_data
    token = token_data["access_token"]
    headers = {"Authorization": f"Bearer {token}", "x-store-key": "Despensa.Snoopy1980"}

    # 7. Verificar endpoint /me
    resp_me = client.get("/api/auth/me", headers=headers)
    assert resp_me.status_code == 200
    assert resp_me.json()["nombre"] == "Administrador"
    assert resp_me.json()["es_admin"] is True

    # 8. Crear un nuevo operador
    nuevo_op_payload = {"nombre": "Cajero Tarde", "pin": "2222", "es_admin": False}
    resp_create = client.post("/api/auth/operadores", json=nuevo_op_payload, headers=headers)
    assert resp_create.status_code == 201
    cajero = resp_create.json()
    assert cajero["nombre"] == "Cajero Tarde"
    assert cajero["es_admin"] is False

    # 9. Login con nuevo operador
    resp_login_cajero = client.post(
        "/api/auth/login",
        json={"usuario_id": cajero["id"], "pin": "2222"},
        headers=store_headers
    )
    assert resp_login_cajero.status_code == 200

    # 10. No se puede eliminar a uno mismo
    resp_del_self = client.delete(f"/api/auth/operadores/{admin['id']}", headers=headers)
    assert resp_del_self.status_code == 400

    # 11. Eliminar el operador recién creado (sin movimientos -> eliminación física)
    resp_del_cajero = client.delete(f"/api/auth/operadores/{cajero['id']}", headers=headers)
    assert resp_del_cajero.status_code == 200
    assert resp_del_cajero.json()["eliminado_fisicamente"] is True


def test_flujo_completo_ledger_y_anulacion(client):
    # Probar que acceder a clientes sin login devuelve 401 Unauthorized
    resp_anon_clientes = client.get("/api/clientes")
    assert resp_anon_clientes.status_code == 401

    # Login como Administrador (PIN 1111)
    operadores = client.get("/api/auth/operadores", headers={"x-store-key": "Despensa.Snoopy1980"}).json()
    admin = next(o for o in operadores if o["nombre"] == "Administrador")
    token = client.post(
        "/api/auth/login",
        json={"usuario_id": admin["id"], "pin": "1111"},
        headers={"x-store-key": "Despensa.Snoopy1980"}
    ).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}", "x-store-key": "Despensa.Snoopy1980"}

    # 1. Crear cliente con saldo inicial migrado de papel ($10.000,00)
    cliente_payload = {
        "nombre": "Carlos Tevez",
        "apodo": "El Apache",
        "telefono": "5491100001111",
        "saldo_inicial": "10000.00"
    }
    resp_cli = client.post("/api/clientes", json=cliente_payload, headers=headers)
    assert resp_cli.status_code == 201
    cliente = resp_cli.json()
    cliente_id = cliente["id"]
    assert Decimal(str(cliente["saldo_actual"])) == Decimal("10000.00")
    assert cliente["telefono"].startswith("+54")
    assert cliente["activo"] is True

    # Verificar que se creó el movimiento inicial
    resp_movs = client.get(f"/api/clientes/{cliente_id}/movimientos", headers=headers)
    assert resp_movs.status_code == 200
    movs = resp_movs.json()
    assert len(movs) == 1
    assert movs[0]["tipo"] == "CARGO"
    assert Decimal(str(movs[0]["monto"])) == Decimal("10000.00")
    assert "migrado del fichero" in movs[0]["nota"]

    # 2. Registrar compra fiada (CARGO de $2.500,50)
    resp_cargo = client.post(
        f"/api/clientes/{cliente_id}/movimientos",
        json={"tipo": "CARGO", "monto": "2500.50", "nota": "Yerba y azúcar"},
        headers=headers
    )
    assert resp_cargo.status_code == 201
    mov_cargo = resp_cargo.json()
    assert Decimal(str(mov_cargo["saldo_resultante"])) == Decimal("12500.50")

    # 3. Registrar pago parcial (PAGO de $5.000,00)
    resp_pago = client.post(
        f"/api/clientes/{cliente_id}/movimientos",
        json={"tipo": "PAGO", "monto": "5000.00", "nota": "Entrega en efectivo"},
        headers=headers
    )
    assert resp_pago.status_code == 201
    mov_pago = resp_pago.json()
    assert Decimal(str(mov_pago["saldo_resultante"])) == Decimal("7500.50")

    # Verificar saldo actual del cliente
    cli_actual = client.get(f"/api/clientes/{cliente_id}", headers=headers).json()
    assert Decimal(str(cli_actual["saldo_actual"])) == Decimal("7500.50")

    # 4. Anular el cargo erróneo de $2.500,50
    cargo_id = mov_cargo["id"]
    resp_anular = client.post(f"/api/movimientos/{cargo_id}/anular", headers=headers)
    assert resp_anular.status_code == 200
    contra_asiento = resp_anular.json()
    assert contra_asiento["tipo"] == "ANULACION_CARGO"
    assert contra_asiento["anula_movimiento_id"] == cargo_id
    # El saldo debía bajar de $7.500,50 a $5.000,00
    assert Decimal(str(contra_asiento["saldo_resultante"])) == Decimal("5000.00")

    # Verificar que el original ahora está marcado como anulado
    movs_actualizados = client.get(f"/api/clientes/{cliente_id}/movimientos", headers=headers).json()
    cargo_original = next(m for m in movs_actualizados if m["id"] == cargo_id)
    assert cargo_original["anulado"] is True

    # 5. Intentar anular de nuevo el mismo cargo -> debe fallar con 400
    resp_re_anular = client.post(f"/api/movimientos/{cargo_id}/anular", headers=headers)
    assert resp_re_anular.status_code == 400

    # 6. Intentar anular el contra-asiento -> debe fallar con 400
    contra_id = contra_asiento["id"]
    resp_anular_contra = client.post(f"/api/movimientos/{contra_id}/anular", headers=headers)
    assert resp_anular_contra.status_code == 400

    # 7. Deshabilitar cliente y verificar que no se pueden asentar nuevos movimientos
    resp_toggle_off = client.patch(f"/api/clientes/{cliente_id}/toggle-activo", headers=headers)
    assert resp_toggle_off.status_code == 200
    assert resp_toggle_off.json()["activo"] is False

    # Intentar cargo en cliente inhabilitado -> debe fallar con 400
    resp_cargo_blocked = client.post(
        f"/api/clientes/{cliente_id}/movimientos",
        json={"tipo": "CARGO", "monto": "100.00", "nota": "No debe permitirse"},
        headers=headers
    )
    assert resp_cargo_blocked.status_code == 400
    assert "inactivo" in resp_cargo_blocked.json()["detail"].lower()

    # Intentar pago en cliente inhabilitado -> debe fallar con 400
    resp_pago_blocked = client.post(
        f"/api/clientes/{cliente_id}/movimientos",
        json={"tipo": "PAGO", "monto": "100.00", "nota": "No debe permitirse"},
        headers=headers
    )
    assert resp_pago_blocked.status_code == 400

    # Reactivar cliente
    resp_toggle_on = client.patch(f"/api/clientes/{cliente_id}/toggle-activo", headers=headers)
    assert resp_toggle_on.status_code == 200
    assert resp_toggle_on.json()["activo"] is True

    # 7b. Editar datos del cliente (nombre, apodo, teléfono, activo)
    resp_update = client.put(
        f"/api/clientes/{cliente_id}",
        json={
            "nombre": "Carlos Alberto Tevez",
            "apodo": "El Jugador del Pueblo",
            "telefono": "11 9999-8888",
            "activo": True
        },
        headers=headers
    )
    assert resp_update.status_code == 200
    updated_cliente = resp_update.json()
    assert updated_cliente["nombre"] == "Carlos Alberto Tevez"
    assert updated_cliente["apodo"] == "El Jugador del Pueblo"
    assert "9999-8888" in updated_cliente["telefono"]
    assert updated_cliente["telefono"].startswith("+54")

    # 8. Resumen mensual y WhatsApp
    resp_resumen = client.get(f"/api/clientes/{cliente_id}/resumen", headers=headers)
    assert resp_resumen.status_code == 200
    resumen = resp_resumen.json()
    assert "texto_whatsapp" in resumen
    assert "Despensa Snoopy" in resumen["texto_whatsapp"]
    assert "Carlos Alberto Tevez" in resumen["texto_whatsapp"]
    assert "El Jugador del Pueblo" in resumen["texto_whatsapp"]
    assert "$5.000,00" in resumen["texto_whatsapp"]
    # Las anulaciones no deben aparecer en el mensaje de WhatsApp enviado al cliente
    assert "ANULADO" not in resumen["texto_whatsapp"]
    assert "ANULACION" not in resumen["texto_whatsapp"]
    assert "2.500" not in resumen["texto_whatsapp"]


def test_spa_static_serving(client):
    # 1. Healthcheck
    resp_health = client.get("/api/health")
    assert resp_health.status_code == 200
    assert resp_health.json()["status"] == "ok"

    # 2. Servir el index.html en la raíz
    resp_index = client.get("/")
    assert resp_index.status_code == 200
    assert "text/html" in resp_index.headers.get("content-type", "")
    assert "Libreta de Fiados" in resp_index.text

    # 3. SPA Fallback para rutas cliente como /clientes o /deudores
    resp_fallback = client.get("/clientes/ver/123")
    assert resp_fallback.status_code == 200
    assert "text/html" in resp_fallback.headers.get("content-type", "")

    # 4. Asegurar que endpoints de /api no existentes den 404 JSON y no index.html
    resp_api_404 = client.get("/api/ruta_inexistente")
    assert resp_api_404.status_code == 404
    assert resp_api_404.headers.get("content-type", "").startswith("application/json")

    # 5. Asegurar bloqueo contra Path Traversal
    resp_traversal = client.get("/../../.env")
    assert resp_traversal.status_code in (403, 404)
    assert "CLOUDFLARE_TUNNEL_TOKEN" not in resp_traversal.text


def test_exportar_excel(client):
    import io
    import openpyxl

    # 1. Login para obtener token
    admin = client.get("/api/auth/operadores", headers={"x-store-key": "Despensa.Snoopy1980"}).json()[0]
    token = client.post(
        "/api/auth/login",
        json={"usuario_id": admin["id"], "pin": "1111"},
        headers={"x-store-key": "Despensa.Snoopy1980"}
    ).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}", "x-store-key": "Despensa.Snoopy1980"}

    # 2. Obtener un cliente existente con token
    clientes = client.get("/api/clientes", headers=headers).json()["items"]
    assert len(clientes) > 0
    cliente_id = clientes[0]["id"]

    # 3. Descarga sin autenticación debe retornar 401
    resp_unauth = client.get(f"/api/clientes/{cliente_id}/exportar-excel")
    assert resp_unauth.status_code == 401

    # 4. Descargar Excel completo con token
    resp_excel = client.get(f"/api/clientes/{cliente_id}/exportar-excel", headers=headers)
    assert resp_excel.status_code == 200
    assert "spreadsheetml.sheet" in resp_excel.headers["content-type"]
    assert "Libreta_" in resp_excel.headers["content-disposition"]

    # 5. Validar con openpyxl que el archivo es un Excel válido
    wb = openpyxl.load_workbook(io.BytesIO(resp_excel.content))
    assert "Movimientos" in wb.sheetnames
    ws = wb["Movimientos"]
    assert ws["A1"].value == "DESPENSA SNOOPY - LIBRETA DE FIADOS"
    assert ws["B4"].value.startswith(clientes[0]["nombre"])

    # 6. Descargar Excel filtrado por mes
    resp_mes = client.get(f"/api/clientes/{cliente_id}/exportar-excel?mes=2026-10", headers=headers)
    assert resp_mes.status_code == 200
    wb_mes = openpyxl.load_workbook(io.BytesIO(resp_mes.content))
    ws_mes = wb_mes["Movimientos"]
    assert "Octubre 2026" in ws_mes["E4"].value


def test_seguridad_rate_limiting_y_headers(client):
    # 1. Cabeceras de seguridad HTTP
    resp_health = client.get("/api/health")
    assert resp_health.status_code == 200
    assert resp_health.headers.get("x-frame-options") == "DENY"
    assert resp_health.headers.get("x-content-type-options") == "nosniff"

    # 2. Docs deshabilitados en producción
    resp_docs = client.get("/docs")
    assert resp_docs.status_code == 404

    # 3. Intentos de fuerza bruta y bloqueo temporal (HTTP 429)
    admin = client.get("/api/auth/operadores", headers={"x-store-key": "Despensa.Snoopy1980"}).json()[0]

    # Ejecutar 5 intentos fallidos
    for i in range(5):
        resp_fail = client.post(
            "/api/auth/login",
            json={"usuario_id": admin["id"], "pin": f"000{i}"},
            headers={"cf-connecting-ip": "203.0.113.50", "x-store-key": "Despensa.Snoopy1980"}
        )
        assert resp_fail.status_code in (401, 429)

    # El 6to intento debe ser bloqueado con 429 Too Many Requests
    resp_lockout = client.post(
        "/api/auth/login",
        json={"usuario_id": admin["id"], "pin": "1111"},
        headers={"cf-connecting-ip": "203.0.113.50", "x-store-key": "Despensa.Snoopy1980"}
    )
    assert resp_lockout.status_code == 429
    assert "bloqueado" in resp_lockout.json()["detail"].lower()


def test_productos_dinamicos_y_articulos(client):
    # 1. Login como administrador
    admin = client.get("/api/auth/operadores", headers={"x-store-key": "Despensa.Snoopy1980"}).json()[0]
    token = client.post(
        "/api/auth/login",
        json={"usuario_id": admin["id"], "pin": "1111"},
        headers={"x-store-key": "Despensa.Snoopy1980"}
    ).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}", "x-store-key": "Despensa.Snoopy1980"}

    # 2. Listar productos sembrados
    prods = client.get("/api/productos", headers=headers).json()
    assert len(prods) >= 1
    garrafa = next(p for p in prods if "garrafa" in p["nombre"].lower())
    assert Decimal(str(garrafa["precio_actual"])) == Decimal("12000.00")

    # 3. Crear cliente de prueba
    cli_resp = client.post(
        "/api/clientes",
        json={"nombre": "Vecino Gas", "saldo_inicial": "0.00"},
        headers=headers
    )
    assert cli_resp.status_code == 201
    cliente = cli_resp.json()
    cli_id = cliente["id"]
    assert Decimal(str(cliente["saldo_actual"])) == Decimal("0.00")
    assert Decimal(str(cliente["total_articulos_pendientes"])) == Decimal("0.00")

    # 4. Anotar 1 Garrafa de 10kg en la libreta del cliente
    art_resp = client.post(
        f"/api/clientes/{cli_id}/articulos",
        json={"producto_id": garrafa["id"], "cantidad": "1.00", "nota": "Envase azul"},
        headers=headers
    )
    assert art_resp.status_code == 201
    articulo = art_resp.json()
    art_id = articulo["id"]
    assert articulo["estado"] == "PENDIENTE"
    assert Decimal(str(articulo["subtotal_actual"])) == Decimal("12000.00")

    # 5. El cliente debe mostrar saldo contable $0 pero saldo_total dinámico de $12.000
    cli_check = client.get(f"/api/clientes/{cli_id}", headers=headers).json()
    assert Decimal(str(cli_check["saldo_actual"])) == Decimal("0.00")
    assert Decimal(str(cli_check["total_articulos_pendientes"])) == Decimal("12000.00")
    assert Decimal(str(cli_check["saldo_total"])) == Decimal("12000.00")
    assert cli_check["articulos_pendientes_count"] == 1

    # 6. Actualizar el precio de la garrafa en el catálogo (de $12.000 a $13.500)
    update_prod = client.put(
        f"/api/productos/{garrafa['id']}",
        json={"precio_actual": "13500.00"},
        headers=headers
    )
    assert update_prod.status_code == 200

    # 7. El valor dinámico en la libreta del cliente debe haberse actualizado AUTOMÁTICAMENTE a $13.500
    cli_check2 = client.get(f"/api/clientes/{cli_id}", headers=headers).json()
    assert Decimal(str(cli_check2["total_articulos_pendientes"])) == Decimal("13500.00")
    assert Decimal(str(cli_check2["saldo_total"])) == Decimal("13500.00")

    # 8. Verificar que el resumen de WhatsApp incluye la garrafa al valor actual de $13.500
    resumen = client.get(f"/api/clientes/{cli_id}/resumen", headers=headers).json()
    assert "Garrafa de gas 10kg" in resumen["texto_whatsapp"]
    assert "$13.500,00" in resumen["texto_whatsapp"]

    # 9. Liquidar la garrafa al momento de cerrar la cuenta
    liq_resp = client.post(
        f"/api/clientes/{cli_id}/articulos/liquidar",
        json={"articulo_ids": [art_id]},
        headers=headers
    )
    assert liq_resp.status_code == 200
    liq_data = liq_resp.json()
    assert Decimal(str(liq_data["total_liquidado"])) == Decimal("13500.00")
    assert Decimal(str(liq_data["nuevo_saldo_actual"])) == Decimal("13500.00")

    # 10. Ahora ya no hay artículos pendientes y el saldo contable en el ledger es $13.500
    cli_check3 = client.get(f"/api/clientes/{cli_id}", headers=headers).json()
    assert Decimal(str(cli_check3["saldo_actual"])) == Decimal("13500.00")
    assert Decimal(str(cli_check3["total_articulos_pendientes"])) == Decimal("0.00")
    assert Decimal(str(cli_check3["saldo_total"])) == Decimal("13500.00")
    assert cli_check3["articulos_pendientes_count"] == 0


