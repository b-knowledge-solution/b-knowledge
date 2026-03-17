#
#  Copyright 2025 The InfiniFlow Authors. All Rights Reserved.
#
#  Licensed under the Apache License, Version 2.0 (the "License");
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.
#

"""
Logging setup using Loguru with file rotation.

Replaces Python stdlib logging with Loguru. Intercepts all stdlib logging
calls so existing code (RAGFlow modules using `logging.getLogger()`) works
unchanged.

Rotation policy (configurable via env vars):
  - LOG_ROTATION:    max file size before rotation  (default: "50 MB")
  - LOG_RETENTION:   how long to keep old logs       (default: "30 days")
  - LOG_COMPRESSION: compress rotated files           (default: "zip")
  - LOG_LEVEL:       minimum log level                (default: "INFO")
  - LOG_LEVELS:      per-package overrides            (e.g. "peewee=WARNING,pdfminer=WARNING")
"""

import logging
import os
import sys

from loguru import logger

from common.file_utils import get_project_base_directory

initialized_root_logger = False


class InterceptHandler(logging.Handler):
    """Route stdlib logging calls to Loguru."""

    def emit(self, record: logging.LogRecord) -> None:
        try:
            level = logger.level(record.levelname).name
        except ValueError:
            level = record.levelno

        frame, depth = sys._getframe(6), 6
        while frame and frame.f_code.co_filename == logging.__file__:
            frame = frame.f_back
            depth += 1

        logger.opt(depth=depth, exception=record.exc_info).log(level, record.getMessage())


def init_root_logger(
    logfile_basename: str,
    log_format: str | None = None,
):
    """
    Initialize Loguru logger with console + rotating file sinks.

    Args:
        logfile_basename: Name prefix for the log file (e.g. "task_executor").
        log_format: Ignored (kept for backward compat). Loguru uses its own format.
    """
    global initialized_root_logger
    if initialized_root_logger:
        return
    initialized_root_logger = True

    log_level = os.environ.get("LOG_LEVEL", "INFO").upper()
    log_rotation = os.environ.get("LOG_ROTATION", "50 MB")
    log_retention = os.environ.get("LOG_RETENTION", "30 days")
    log_compression = os.environ.get("LOG_COMPRESSION", "zip")
    # Module prefix for distinguishing logs across services (e.g. [task-executor], [converter])
    log_prefix = os.environ.get("LOG_PREFIX", logfile_basename)

    log_dir = os.path.abspath(os.path.join(get_project_base_directory(), "logs"))
    os.makedirs(log_dir, exist_ok=True)
    log_path = os.path.join(log_dir, f"{logfile_basename}.log")

    # Remove default stderr sink, re-add with our level
    logger.remove()

    # Console sink — colorized with module prefix
    logger.add(
        sys.stderr,
        level=log_level,
        format=f"<yellow>[{log_prefix}]</yellow> <green>{{time:YYYY-MM-DD HH:mm:ss}}</green> | <level>{{level:<8}}</level> | <cyan>{{name}}</cyan>:<cyan>{{function}}</cyan>:<cyan>{{line}}</cyan> - <level>{{message}}</level>",
        colorize=True,
    )

    # File sink — rotation + retention + compression with module prefix
    logger.add(
        log_path,
        level=log_level,
        format=f"[{log_prefix}] {{time:YYYY-MM-DD HH:mm:ss}} | {{level:<8}} | {{name}}:{{function}}:{{line}} - {{message}}",
        rotation=log_rotation,
        retention=log_retention,
        compression=log_compression,
        encoding="utf-8",
        enqueue=True,  # thread-safe async writing
    )

    # Intercept stdlib logging → Loguru
    logging.basicConfig(handlers=[InterceptHandler()], level=0, force=True)

    # Apply per-package log levels from LOG_LEVELS env var
    log_levels_str = os.environ.get("LOG_LEVELS", "")
    pkg_levels: dict[str, str] = {}
    for entry in log_levels_str.split(","):
        parts = entry.strip().split("=")
        if len(parts) == 2:
            pkg_levels[parts[0].strip()] = parts[1].strip().upper()

    # Default noisy packages to WARNING
    for pkg in ("peewee", "pdfminer"):
        if pkg not in pkg_levels:
            pkg_levels[pkg] = "WARNING"

    for pkg_name, pkg_level in pkg_levels.items():
        logging.getLogger(pkg_name).setLevel(pkg_level)

    logger.info(
        "Logger initialized | file={} | rotation={} | retention={} | compression={} | level={}",
        log_path, log_rotation, log_retention, log_compression, log_level,
    )


def log_exception(e, *args):
    logger.exception(str(e))
    for a in args:
        try:
            text = getattr(a, "text")
        except Exception:
            text = None
        if text is not None:
            logger.error(text)
            raise Exception(text)
        logger.error(str(a))
    raise e
