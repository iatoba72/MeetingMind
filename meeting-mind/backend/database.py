# Database Configuration and Session Management
# Optimized for production with connection pooling, monitoring, and error handling
# Supports both development (SQLite) and production (PostgreSQL) environments

import os
import logging
from typing import Generator, Optional
from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool
from contextlib import contextmanager
from models import Base
import time

# Configure logging for database operations
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Database configuration from environment variables
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./meetingmind.db")
DATABASE_ECHO = os.getenv("DATABASE_ECHO", "false").lower() == "true"
DATABASE_POOL_SIZE = int(os.getenv("DATABASE_POOL_SIZE", "10"))
DATABASE_MAX_OVERFLOW = int(os.getenv("DATABASE_MAX_OVERFLOW", "20"))
DATABASE_POOL_TIMEOUT = int(os.getenv("DATABASE_POOL_TIMEOUT", "30"))

# Determine database type for configuration optimization
is_sqlite = DATABASE_URL.startswith("sqlite")
is_postgresql = DATABASE_URL.startswith("postgresql")

def get_engine_config():
    """
    Get database engine configuration based on database type
    
    Design Decision: Different databases have different optimal configurations.
    SQLite for development/testing, PostgreSQL for production.
    """
    base_config = {
        "echo": DATABASE_ECHO,
        "future": True,  # Enable SQLAlchemy 2.0 style
    }
    
    if is_sqlite:
        # SQLite configuration for development
        return {
            **base_config,
            "poolclass": StaticPool,
            "connect_args": {
                "check_same_thread": False,
                "timeout": 30,
                # Enable WAL mode for better concurrency
                "isolation_level": None,
            },
        }
    elif is_postgresql:
        # PostgreSQL configuration for production
        return {
            **base_config,
            "pool_size": DATABASE_POOL_SIZE,
            "max_overflow": DATABASE_MAX_OVERFLOW,
            "pool_timeout": DATABASE_POOL_TIMEOUT,
            "pool_pre_ping": True,  # Validate connections before use
            "pool_recycle": 3600,   # Recycle connections every hour
            "connect_args": {
                "connect_timeout": 10,
                "application_name": "MeetingMind",
                "options": "-c timezone=UTC",  # Ensure UTC timezone
            },
        }
    else:
        # Default configuration for other databases
        return base_config

# Create database engine with optimized configuration
engine = create_engine(DATABASE_URL, **get_engine_config())

# Configure session factory with optimized settings
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,  # Manual control over when to flush
    bind=engine,
    expire_on_commit=False,  # Keep objects accessible after commit
)

# Database event listeners for monitoring and optimization
@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    """
    Configure SQLite for optimal performance and data integrity
    
    Design Decision: SQLite needs specific configuration for production-like
    behavior including foreign key constraints and Write-Ahead Logging.
    """
    if is_sqlite:
        cursor = dbapi_connection.cursor()
        # Enable foreign key constraints
        cursor.execute("PRAGMA foreign_keys=ON")
        # Enable Write-Ahead Logging for better concurrency
        cursor.execute("PRAGMA journal_mode=WAL")
        # Optimize SQLite performance
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA cache_size=-64000")  # 64MB cache
        cursor.execute("PRAGMA temp_store=MEMORY")
        cursor.close()

@event.listens_for(Engine, "before_cursor_execute")
def receive_before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    """Log slow queries for performance monitoring"""
    context._query_start_time = time.time()

@event.listens_for(Engine, "after_cursor_execute")
def receive_after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    """Log and monitor query execution time"""
    total = time.time() - context._query_start_time
    
    # Log slow queries (> 1 second)
    if total > 1.0:
        logger.warning(f"Slow query detected: {total:.2f}s - {statement[:200]}...")
    
    # Log very slow queries with full details
    if total > 5.0:
        logger.error(f"Very slow query: {total:.2f}s - {statement}")

class DatabaseManager:
    """
    Database manager for health checks, migrations, and maintenance
    
    Design Decision: Centralized database management enables health monitoring,
    automated maintenance, and operational visibility.
    """
    
    def __init__(self):
        self.engine = engine
        self.SessionLocal = SessionLocal
    
    def health_check(self) -> dict:
        """
        Perform comprehensive database health check
        
        Returns connection status, performance metrics, and configuration info.
        """
        try:
            start_time = time.time()
            
            with self.get_session() as session:
                # Test basic connectivity
                result = session.execute(text("SELECT 1 as health_check"))
                result.fetchone()
                
                # Get database statistics
                if is_postgresql:
                    stats_query = text("""
                        SELECT 
                            schemaname,
                            tablename,
                            n_tup_ins + n_tup_upd + n_tup_del as total_operations,
                            n_live_tup as live_tuples
                        FROM pg_stat_user_tables 
                        WHERE schemaname = 'public'
                        ORDER BY total_operations DESC
                        LIMIT 5
                    """)
                    table_stats = session.execute(stats_query).fetchall()
                else:
                    table_stats = []
                
                response_time = (time.time() - start_time) * 1000
                
                return {
                    "status": "healthy",
                    "database_type": "postgresql" if is_postgresql else "sqlite",
                    "response_time_ms": round(response_time, 2),
                    "connection_pool": {
                        "size": engine.pool.size() if hasattr(engine.pool, 'size') else None,
                        "checked_in": engine.pool.checkedin() if hasattr(engine.pool, 'checkedin') else None,
                        "checked_out": engine.pool.checkedout() if hasattr(engine.pool, 'checkedout') else None,
                        "overflow": engine.pool.overflow() if hasattr(engine.pool, 'overflow') else None,
                    },
                    "table_stats": [dict(row._mapping) for row in table_stats] if table_stats else [],
                    "engine_config": {
                        "echo": engine.echo,
                        "pool_size": getattr(engine.pool, 'size', lambda: None)(),
                        "max_overflow": getattr(engine.pool, '_max_overflow', None),
                    }
                }
                
        except Exception as e:
            logger.error(f"Database health check failed: {e}")
            return {
                "status": "unhealthy",
                "error": str(e),
                "response_time_ms": (time.time() - start_time) * 1000
            }
    
    def create_tables(self, drop_existing: bool = False):
        """
        Create all database tables
        
        Args:
            drop_existing: Whether to drop existing tables first (dangerous!)
        """
        try:
            if drop_existing:
                logger.warning("Dropping all existing tables...")
                Base.metadata.drop_all(bind=engine)
            
            logger.info("Creating database tables...")
            Base.metadata.create_all(bind=engine)
            
            # Create PostgreSQL-specific extensions if needed
            if is_postgresql:
                with self.get_session() as session:
                    try:
                        # Enable trigram extension for full-text search
                        session.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
                        session.commit()
                        logger.info("Enabled PostgreSQL extensions")
                    except Exception as e:
                        logger.warning(f"Could not enable PostgreSQL extensions: {e}")
                        session.rollback()
            
            logger.info("Database tables created successfully")
            
        except Exception as e:
            logger.error(f"Failed to create database tables: {e}")
            raise
    
    @contextmanager
    def get_session(self) -> Generator[Session, None, None]:
        """
        Get database session with automatic cleanup and error handling
        
        Design Decision: Context manager ensures proper session cleanup
        even in error scenarios, preventing connection leaks.
        """
        session = self.SessionLocal()
        try:
            yield session
            session.commit()
        except Exception as e:
            session.rollback()
            logger.error(f"Database session error: {e}")
            raise
        finally:
            session.close()
    
    def get_session_for_dependency(self) -> Generator[Session, None, None]:
        """
        Get database session for FastAPI dependency injection
        
        Used with FastAPI's Depends() for automatic session management.
        """
        with self.get_session() as session:
            yield session

# Global database manager instance
db_manager = DatabaseManager()

# FastAPI dependency for database sessions
def get_db() -> Generator[Session, None, None]:
    """
    Database session dependency for FastAPI routes
    
    Usage:
        @app.get("/endpoint")
        async def endpoint(db: Session = Depends(get_db)):
            # Use db session here
    """
    return db_manager.get_session_for_dependency()

def init_database():
    """
    Initialize database with tables and basic configuration
    
    Called during application startup to ensure database is ready.
    """
    try:
        logger.info("Initializing database...")
        
        # Create tables if they don't exist
        db_manager.create_tables(drop_existing=False)
        
        # Verify database health
        health = db_manager.health_check()
        if health["status"] == "healthy":
            logger.info(f"Database initialized successfully - Response time: {health['response_time_ms']}ms")
        else:
            logger.error(f"Database health check failed: {health}")
            raise Exception("Database is not healthy after initialization")
            
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
        raise

# Database utility functions for common operations
class DatabaseUtils:
    """Utility functions for common database operations"""
    
    @staticmethod
    def execute_sql_file(file_path: str, session: Session):
        """Execute SQL commands from a file"""
        import os.path
        
        # Validate file path to prevent directory traversal
        if not os.path.isfile(file_path):
            raise ValueError(f"Invalid file path: {file_path}")
        
        # Only allow .sql files in specific directories
        allowed_dirs = ['migrations', 'scripts', 'sql']
        file_dir = os.path.dirname(os.path.abspath(file_path))
        if not any(allowed_dir in file_dir for allowed_dir in allowed_dirs):
            raise ValueError(f"SQL file must be in allowed directory: {file_path}")
            
        try:
            with open(file_path, 'r') as file:
                sql_commands = file.read()
                
            # Basic validation - reject files with dangerous patterns
            dangerous_patterns = ['DROP DATABASE', 'DROP SCHEMA', 'TRUNCATE', '--', '/*']
            sql_upper = sql_commands.upper()
            for pattern in dangerous_patterns:
                if pattern in sql_upper:
                    raise ValueError(f"SQL file contains dangerous pattern: {pattern}")
                
            # Split by semicolon and execute each command
            for command in sql_commands.split(';'):
                command = command.strip()
                if command:
                    # Additional validation per command
                    if any(dangerous in command.upper() for dangerous in ['DROP DATABASE', 'DROP SCHEMA']):
                        continue
                    session.execute(text(command))
            
            session.commit()
            logger.info(f"Successfully executed SQL file: {file_path}")
            
        except Exception as e:
            session.rollback()
            logger.error(f"Failed to execute SQL file {file_path}: {e}")
            raise
    
    @staticmethod
    def backup_database(backup_path: str):
        """Create database backup (SQLite only)"""
        if is_sqlite:
            import shutil
            try:
                # Extract database file path from URL
                db_file = DATABASE_URL.replace("sqlite:///", "")
                shutil.copy2(db_file, backup_path)
                logger.info(f"Database backed up to: {backup_path}")
            except Exception as e:
                logger.error(f"Database backup failed: {e}")
                raise
        else:
            logger.warning("Database backup not implemented for non-SQLite databases")
    
    @staticmethod
    def get_table_row_counts(session: Session) -> dict:
        """Get row counts for all tables"""
        row_counts = {}
        
        try:
            for table in Base.metadata.tables.values():
                # Use parameterized query to prevent SQL injection
                # table.name is from SQLAlchemy metadata, so it's safe
                if table.name.replace('_', '').replace('-', '').isalnum():
                    result = session.execute(text(f"SELECT COUNT(*) FROM {table.name}"))
                    count = result.scalar()
                    row_counts[table.name] = count
                else:
                    logger.warning(f"Skipping table with suspicious name: {table.name}")
                    row_counts[table.name] = 0
                
            return row_counts
            
        except Exception as e:
            logger.error(f"Failed to get table row counts: {e}")
            return {}

# Export main components
__all__ = [
    "engine",
    "SessionLocal", 
    "db_manager",
    "get_db",
    "init_database",
    "DatabaseManager",
    "DatabaseUtils"
]