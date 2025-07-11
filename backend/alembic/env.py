# Alembic Environment Configuration
# Handles database migrations with support for multiple environments and auto-generation

import os
import sys
from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context

# Add the backend directory to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Import our models and database configuration
from models import Base
from database import DATABASE_URL

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Set the SQLAlchemy URL from environment variable
if DATABASE_URL:
    config.set_main_option("sqlalchemy.url", DATABASE_URL)

# Add your model's MetaData object here for 'autogenerate' support
target_metadata = Base.metadata

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.


def include_name(name, type_, parent_names):
    """
    Determine which database objects to include in migrations

    Design Decision: Exclude certain system tables and objects
    that shouldn't be managed by migrations.
    """
    if type_ == "table":
        # Exclude system tables and temporary tables
        exclude_tables = {
            "alembic_version",  # Alembic's version table
            "spatial_ref_sys",  # PostGIS system table
        }
        return name not in exclude_tables

    if type_ == "index":
        # Exclude auto-generated indexes that we'll create manually
        exclude_patterns = [
            "ix_",  # SQLAlchemy auto-generated indexes
            "pk_",  # Primary key indexes
            "uq_",  # Unique constraint indexes
        ]
        return not any(name.startswith(pattern) for pattern in exclude_patterns)

    return True


def include_object(object, name, type_, reflected, compare_to):
    """
    Determine whether to include an object in the autogenerated migration

    This function provides fine-grained control over what gets included
    in migrations when using autogenerate.
    """
    # Always include our defined tables
    if type_ == "table" and object.schema is None:
        return True

    # Include custom indexes and constraints
    if type_ in ("index", "unique_constraint", "foreign_key_constraint"):
        return True

    return False


def compare_type(
    context, inspected_column, metadata_column, inspected_type, metadata_type
):
    """
    Compare column types for autogenerate

    Design Decision: Handle database-specific type variations
    to prevent unnecessary migrations.
    """
    # Handle VARCHAR vs TEXT differences
    if hasattr(metadata_type, "length") and metadata_type.length is None:
        if str(inspected_type).upper() in ("TEXT", "CLOB"):
            return False

    # Handle UUID type variations
    if str(metadata_type).upper() == "UUID":
        if str(inspected_type).upper() in ("UUID", "CHAR(36)", "VARCHAR(36)"):
            return False

    # Handle JSON/JSONB type variations
    if str(metadata_type).upper() in ("JSON", "JSONB"):
        if str(inspected_type).upper() in ("JSON", "JSONB", "TEXT"):
            return False

    return None  # Use default comparison


def run_migrations_offline():
    """
    Run migrations in 'offline' mode.

    This configures the context with just a URL and not an Engine,
    though an Engine is acceptable here as well. By skipping the Engine
    creation we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_name=include_name,
        include_object=include_object,
        compare_type=compare_type,
        # Add custom render options for better migration formatting
        render_as_batch=True,  # Enable batch mode for SQLite
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    """
    Run migrations in 'online' mode.

    In this scenario we need to create an Engine and associate a connection
    with the context. This is the most common scenario for production deployments.
    """

    # Create engine configuration
    configuration = config.get_section(config.config_ini_section)
    configuration["sqlalchemy.url"] = DATABASE_URL

    # Add connection pooling configuration for production
    if DATABASE_URL and DATABASE_URL.startswith("postgresql"):
        configuration.update(
            {
                "sqlalchemy.pool_size": "10",
                "sqlalchemy.max_overflow": "20",
                "sqlalchemy.pool_timeout": "30",
                "sqlalchemy.pool_pre_ping": "true",
                "sqlalchemy.pool_recycle": "3600",
            }
        )

    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,  # Use NullPool for migrations to avoid connection issues
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_name=include_name,
            include_object=include_object,
            compare_type=compare_type,
            # Migration-specific options
            render_as_batch=True,  # Enable batch mode for SQLite compatibility
            compare_server_default=True,  # Include server defaults in comparison
            transaction_per_migration=True,  # Wrap each migration in a transaction
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
