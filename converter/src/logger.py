"""
Converter Logger — configures loguru for the converter module.

Replicates the pattern from client/src/utils/logger.py.
Provides colored console output and optional rotating file logs.

Usage:
    from src.logger import logger, setup_logger
    setup_logger()        # default console logging at INFO
    logger.info("...")    # use directly
"""
import sys
import os
from loguru import logger
from pathlib import Path
from typing import Optional


def setup_logger(level: str = 'DEBUG', log_dir: Optional[str] = None) -> None:
    """
    Configure the converter logger using loguru.

    @param level: Logging level (default: DEBUG for detailed converter output).
    @param log_dir: Directory for log files. Defaults to converter/.data/logs.
    """
    # Module prefix for distinguishing logs across services
    log_prefix = os.environ.get('LOG_PREFIX', 'converter')

    # Remove default handler
    logger.remove()

    # Improve visibility for DEBUG on black backgrounds
    logger.level("DEBUG", color="<cyan>")

    # Console Handler — colored, concise format with module prefix
    logger.add(
        sys.stderr,
        level=level,
        format=f"<yellow>[{log_prefix}]</yellow> <green>{{time:HH:mm:ss}}</green> | <level>{{level: <8}}</level> | <cyan>{{name}}</cyan>:<cyan>{{function}}</cyan>:<cyan>{{line}}</cyan> — <level>{{message}}</level>",
    )

    # File Handler — rotating logs with module prefix
    if log_dir is None:
        _converter_root = Path(__file__).resolve().parent.parent
        log_dir = str(_converter_root / '.data' / 'logs')

    os.makedirs(log_dir, exist_ok=True)
    log_path = os.path.join(log_dir, 'converter_{time}.log')

    logger.add(
        log_path,
        rotation='10 MB',
        retention='10 days',
        level='DEBUG',
        format=f"[{log_prefix}] {{time:YYYY-MM-DD HH:mm:ss}} | {{level: <8}} | {{name}}:{{function}}:{{line}} — {{message}}",
    )
