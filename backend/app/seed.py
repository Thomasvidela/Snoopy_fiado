from decimal import Decimal
import logging
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session
from app.database import Base, SessionLocal, engine
from app.dependencies import hash_pin
from app.models import Movimiento, Producto, Usuario, ahora_argentina

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Operador Administrador único inicial por defecto
ADMIN_INICIAL = {
    "nombre": "Administrador",
    "pin": "1111",
    "es_admin": True,
}

PRODUCTOS_INICIALES = [
    {"nombre": "Garrafa de gas 10kg", "precio_actual": Decimal("12000.00"), "unidad": "garrafa"},
    {"nombre": "Bidón de agua 20L", "precio_actual": Decimal("4500.00"), "unidad": "bidón"},
    {"nombre": "Bolsa de carbón 4kg", "precio_actual": Decimal("3500.00"), "unidad": "bolsa"},
]


def ensure_schema_migrations(db: Session):
    """Asegura que las columnas de períodos contables existan en bases ya creadas y completa valores históricos."""
    bind = db.get_bind()
    inspector = inspect(bind)
    tablas = inspector.get_table_names()

    if "clientes" in tablas:
        cols_clientes = {c["name"] for c in inspector.get_columns("clientes")}
        if "periodo_actual" not in cols_clientes:
            db.execute(text("ALTER TABLE clientes ADD COLUMN periodo_actual VARCHAR(7)"))
            db.commit()
            logger.info("Migración automática: columna 'periodo_actual' agregada a 'clientes'.")

    if "movimientos" in tablas:
        cols_movs = {c["name"] for c in inspector.get_columns("movimientos")}
        if "periodo" not in cols_movs:
            db.execute(text("ALTER TABLE movimientos ADD COLUMN periodo VARCHAR(7)"))
            db.commit()
            logger.info("Migración automática: columna 'periodo' agregada a 'movimientos'.")

        # Rellenar período para movimientos históricos que no lo tengan asignado
        sin_periodo = db.query(Movimiento).filter(Movimiento.periodo.is_(None)).all()
        if sin_periodo:
            for m in sin_periodo:
                m.periodo = m.fecha_creacion.strftime("%Y-%m")
            db.commit()
            logger.info(f"Migración automática: período asignado a {len(sin_periodo)} movimiento(s) históricos.")


def seed_database(db: Session = None):
    close_db_at_end = False
    if db is None:
        Base.metadata.create_all(bind=engine)
        db = SessionLocal()
        close_db_at_end = True

    try:
        ensure_schema_migrations(db)

        # Sembrar únicamente el Administrador inicial si no existe ningún usuario
        total_usuarios = db.query(Usuario).count()
        if total_usuarios == 0:
            admin = Usuario(
                nombre=ADMIN_INICIAL["nombre"],
                pin_hash=hash_pin(ADMIN_INICIAL["pin"]),
                activo=True,
                es_admin=True
            )
            db.add(admin)
            db.commit()
            logger.info(f"Operador administrador inicial creado: {admin.nombre} (PIN: {ADMIN_INICIAL['pin']})")

        # Sembrar productos iniciales de precio dinámico si no existen
        total_productos = db.query(Producto).count()
        if total_productos == 0:
            ahora = ahora_argentina()
            for p in PRODUCTOS_INICIALES:
                prod = Producto(
                    nombre=p["nombre"],
                    precio_actual=p["precio_actual"],
                    unidad=p["unidad"],
                    activo=True,
                    fecha_creacion=ahora,
                    fecha_actualizacion=ahora
                )
                db.add(prod)
            db.commit()
            logger.info(f"Productos de precio dinámico iniciales sembrados ({len(PRODUCTOS_INICIALES)} productos).")

    finally:
        if close_db_at_end:
            db.close()


if __name__ == "__main__":
    seed_database()
