from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

import duckdb

from config import DUCKDB_FILE


def database_path() -> Path:
    return Path(DUCKDB_FILE)


def connect_readonly() -> duckdb.DuckDBPyConnection:
    """Return a read-only DuckDB connection to the warehouse."""
    return duckdb.connect(str(database_path()), read_only=True)


@contextmanager
def open_readonly_connection() -> Iterator[duckdb.DuckDBPyConnection]:
    connection = connect_readonly()
    try:
        yield connection
    finally:
        connection.close()
