import logging
from sqlalchemy.orm import Session
from app.database import Base, SessionLocal, engine
from app.dependencies import hash_pin
from app.models import Usuario

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Operador Administrador único inicial por defecto
ADMIN_INICIAL = {
    "nombre": "Administrador",
    "pin": "1111",
    "es_admin": True,
}


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

    finally:
        if close_db_at_end:
            db.close()


if __name__ == "__main__":
    seed_database()
