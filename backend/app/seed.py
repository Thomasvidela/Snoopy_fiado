from decimal import Decimal
import logging
from sqlalchemy.orm import Session
from app.database import Base, SessionLocal, engine
from app.dependencies import hash_pin
from app.models import Producto, Usuario, ahora_argentina

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


def seed_database(db: Session = None):
    close_db_at_end = False
    if db is None:
        Base.metadata.create_all(bind=engine)
        db = SessionLocal()
        close_db_at_end = True

    try:
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
