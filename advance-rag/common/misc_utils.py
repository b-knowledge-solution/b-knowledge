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
Miscellaneous utility functions used throughout the RAG worker.

Includes UUID generation, image downloading, hashing, byte-size formatting,
a thread-safe ``once`` decorator, lazy PyTorch installation, and a shared
thread-pool executor for offloading blocking work from async code.
"""

import asyncio
import base64
import functools
import hashlib
import logging
import os
import subprocess
import sys
import threading
import uuid

from concurrent.futures import ThreadPoolExecutor

import requests

def get_uuid():
    """Generate a new UUID4 hex string (random, 32 hex characters).

    Standardized to UUID4 to match the Node.js backend's UUID generation.
    UUID4 uses cryptographically random bytes, avoiding UUID1's MAC address
    leakage and providing consistent behavior across Python and Node.js.

    Returns:
        A 32-character lowercase hex UUID string.
    """
    return uuid.uuid4().hex


def download_img(url):
    """Download an image from *url* and return it as a data-URI string.

    Args:
        url: HTTP(S) URL of the image to download. If falsy, returns "".

    Returns:
        A ``data:<content-type>;base64,...`` string, or "" if *url* is empty.
    """
    if not url:
        return ""
    response = requests.get(url)
    return "data:" + \
        response.headers.get('Content-Type', 'image/jpg') + ";" + \
        "base64," + base64.b64encode(response.content).decode("utf-8")


def hash_str2int(line: str, mod: int = 10 ** 8) -> int:
    """Hash a string to an integer using SHA-1, modulo *mod*.

    Args:
        line: Input string to hash.
        mod: Modulus for the resulting integer (default 10^8).

    Returns:
        Integer hash in the range [0, mod).
    """
    return int(hashlib.sha1(line.encode("utf-8")).hexdigest(), 16) % mod

def convert_bytes(size_in_bytes: int) -> str:
    """
    Format size in bytes into a human-readable string with appropriate units.

    Args:
        size_in_bytes: Number of bytes.

    Returns:
        Formatted string like "1.23 MB" or "512 B".
    """
    if size_in_bytes == 0:
        return "0 B"

    units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
    i = 0
    size = float(size_in_bytes)

    # Scale up through units until the value is under 1024
    while size >= 1024 and i < len(units) - 1:
        size /= 1024
        i += 1

    # Choose decimal precision based on magnitude
    if i == 0 or size >= 100:
        return f"{size:.0f} {units[i]}"
    elif size >= 10:
        return f"{size:.1f} {units[i]}"
    else:
        return f"{size:.2f} {units[i]}"


def once(func):
    """
    A thread-safe decorator that ensures the decorated function runs exactly once,
    caching and returning its result for all subsequent calls. This prevents
    race conditions in multi-thread environments by using a lock to protect
    the execution state.

    Args:
        func (callable): The function to be executed only once.

    Returns:
        callable: A wrapper function that executes `func` on the first call
                  and returns the cached result thereafter.

    Example:
        @once
        def compute_expensive_value():
            print("Computing...")
            return 42

        # First call: executes and prints
        # Subsequent calls: return 42 without executing
    """
    executed = False
    result = None
    lock = threading.Lock()
    def wrapper(*args, **kwargs):
        nonlocal executed, result
        with lock:
            if not executed:
                executed = True
                result = func(*args, **kwargs)
        return result
    return wrapper

@once
def pip_install_torch():
    """Install PyTorch via pip if a GPU device is configured.

    Only runs once (guarded by ``@once``). Skipped entirely when the
    ``DEVICE`` environment variable is ``"cpu"`` or unset.
    """
    device = os.getenv("DEVICE", "cpu")
    if device=="cpu":
        return
    logging.info("Installing pytorch")
    pkg_names = ["torch>=2.5.0,<3.0.0"]
    subprocess.check_call([sys.executable, "-m", "pip", "install", *pkg_names])


@once
def _thread_pool_executor():
    """Create and return a shared ThreadPoolExecutor (singleton via ``@once``).

    The pool size is controlled by the ``THREAD_POOL_MAX_WORKERS`` environment
    variable (default 128, minimum 1).

    Returns:
        A ``ThreadPoolExecutor`` instance.
    """
    max_workers_env = os.getenv("THREAD_POOL_MAX_WORKERS", "128")
    try:
        max_workers = int(max_workers_env)
    except ValueError:
        max_workers = 128
    if max_workers < 1:
        max_workers = 1
    return ThreadPoolExecutor(max_workers=max_workers)


async def thread_pool_exec(func, *args, **kwargs):
    """Run a blocking function in the shared thread pool from an async context.

    Wraps ``loop.run_in_executor`` with the singleton thread pool.  If keyword
    arguments are provided, ``functools.partial`` is used to bind them.

    Args:
        func: The synchronous callable to execute.
        *args: Positional arguments for *func*.
        **kwargs: Keyword arguments for *func*.

    Returns:
        The return value of *func*.
    """
    loop = asyncio.get_running_loop()
    if kwargs:
        func = functools.partial(func, *args, **kwargs)
        return await loop.run_in_executor(_thread_pool_executor(), func)
    return await loop.run_in_executor(_thread_pool_executor(), func, *args)
