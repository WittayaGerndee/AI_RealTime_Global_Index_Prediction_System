from sqlalchemy import Column, Integer, String, Numeric, DateTime, JSON
from sqlalchemy.sql import func
from backend.app.db.session import Base

class ModelVersion(Base):
    __tablename__ = "model_versions"

    id = Column(Integer, primary_key=True, index=True)
    model_name = Column(String(64), nullable=False)
    version = Column(String(32), unique=True, nullable=False, index=True)
    training_start = Column(DateTime(timezone=True), nullable=True)
    training_end = Column(DateTime(timezone=True), nullable=True)
    dataset_hash = Column(String(128), nullable=True)
    features = Column(JSON, nullable=True)
    algorithm = Column(String(64), nullable=False)
    hyperparameters = Column(JSON, nullable=True)
    validation_mae = Column(Numeric(12, 4), nullable=True)
    validation_rmse = Column(Numeric(12, 4), nullable=True)
    direction_accuracy = Column(Numeric(8, 4), nullable=True)
    range_coverage = Column(Numeric(8, 4), nullable=True)
    status = Column(String(32), nullable=False, default="ACTIVE") # TRAINING, VALIDATED, ACTIVE, RETIRED, FAILED
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
