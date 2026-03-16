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
YAML-based configuration loading and management.

Reads the main service configuration (``service_conf.yaml``) from the
``conf/`` directory, with optional local overrides (``local.service_conf.yaml``).
Provides helpers to read, write, and query individual config keys, decrypt
database passwords, and display redacted config summaries for logging.
"""

import os
import copy
import logging
import importlib
from filelock import FileLock

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from common.file_utils import get_project_base_directory
from common.constants import SERVICE_CONF
from ruamel.yaml import YAML


def load_yaml_conf(conf_path):
    """Load a YAML configuration file and return its contents as a dict.

    Args:
        conf_path: Absolute or relative path to the YAML file. Relative paths
            are resolved against the project base directory.

    Returns:
        Parsed YAML content (usually a dict).

    Raises:
        EnvironmentError: If the file cannot be read or parsed.
    """
    if not os.path.isabs(conf_path):
        conf_path = os.path.join(get_project_base_directory(), conf_path)
    try:
        with open(conf_path) as f:
            yaml = YAML(typ="safe", pure=True)
            return yaml.load(f)
    except Exception as e:
        raise EnvironmentError("loading yaml file config from {} failed:".format(conf_path), e)


def rewrite_yaml_conf(conf_path, config):
    """Write *config* dict back to a YAML file, overwriting its contents.

    Args:
        conf_path: Absolute or relative path to the YAML file.
        config: Dict to serialize as YAML.

    Raises:
        EnvironmentError: If the file cannot be written.
    """
    if not os.path.isabs(conf_path):
        conf_path = os.path.join(get_project_base_directory(), conf_path)
    try:
        with open(conf_path, "w") as f:
            yaml = YAML(typ="safe")
            yaml.dump(config, f)
    except Exception as e:
        raise EnvironmentError("rewrite yaml file config {} failed:".format(conf_path), e)


def conf_realpath(conf_name):
    """Return the absolute path to a config file inside ``conf/``.

    Args:
        conf_name: Filename (e.g. ``"service_conf.yaml"``).

    Returns:
        Absolute path string.
    """
    conf_path = f"conf/{conf_name}"
    return os.path.join(get_project_base_directory(), conf_path)


def read_config(conf_name=SERVICE_CONF):
    """Read and merge the global and local YAML config files.

    The local config (``local.<conf_name>``) overrides keys in the global
    config. Both files are expected to contain dicts.

    Args:
        conf_name: Config filename (default ``service_conf.yaml``).

    Returns:
        Merged configuration dict.

    Raises:
        ValueError: If either config file does not contain a dict.
    """
    local_config = {}
    local_path = conf_realpath(f'local.{conf_name}')

    # load local config file (overrides)
    if os.path.exists(local_path):
        local_config = load_yaml_conf(local_path)
        if not isinstance(local_config, dict):
            raise ValueError(f'Invalid config file: "{local_path}".')

    global_config_path = conf_realpath(conf_name)
    global_config = load_yaml_conf(global_config_path)

    if not isinstance(global_config, dict):
        raise ValueError(f'Invalid config file: "{global_config_path}".')

    # Local overrides global
    global_config.update(local_config)
    return global_config


# Module-level config singleton, loaded once at import time
CONFIGS = read_config()


def show_configs():
    """Log the current configuration with sensitive values redacted.

    Passwords, access keys, secret keys, SAS tokens, and OAuth client
    secrets are replaced with asterisks before logging.
    """
    msg = f"Current configs, from {conf_realpath(SERVICE_CONF)}:"
    for k, v in CONFIGS.items():
        if isinstance(v, dict):
            if "password" in v:
                v = copy.deepcopy(v)
                v["password"] = "*" * 8
            if "access_key" in v:
                v = copy.deepcopy(v)
                v["access_key"] = "*" * 8
            if "secret_key" in v:
                v = copy.deepcopy(v)
                v["secret_key"] = "*" * 8
            if "secret" in v:
                v = copy.deepcopy(v)
                v["secret"] = "*" * 8
            if "sas_token" in v:
                v = copy.deepcopy(v)
                v["sas_token"] = "*" * 8
            if "oauth" in k:
                v = copy.deepcopy(v)
                for key, val in v.items():
                    if "client_secret" in val:
                        val["client_secret"] = "*" * 8
            if "authentication" in k:
                v = copy.deepcopy(v)
                for key, val in v.items():
                    if isinstance(val, dict) and "http_secret_key" in val:
                        val["http_secret_key"] = "*" * 8
        msg += f"\n\t{k}: {v}"
    logging.info(msg)


def get_base_config(key, default=None):
    """Retrieve a top-level config value by *key*.

    Falls back to the matching upper-case environment variable when no
    explicit *default* is provided, then to the YAML config.

    Args:
        key: Config key to look up.
        default: Fallback value if the key is not in CONFIGS. If None,
            checks ``os.environ[KEY.upper()]`` first.

    Returns:
        The config value, or *default*.
    """
    if key is None:
        return None
    if default is None:
        default = os.environ.get(key.upper())
    return CONFIGS.get(key, default)


def decrypt_database_password(password):
    """Decrypt an encrypted database password using the configured module.

    Only decrypts if ``encrypt_password`` is truthy in the config and a
    ``private_key`` is available.

    Args:
        password: The (possibly encrypted) password string.

    Returns:
        Decrypted password string, or the original if encryption is not enabled.

    Raises:
        ValueError: If encryption is enabled but no private key is configured.
    """
    encrypt_password = get_base_config("encrypt_password", False)
    encrypt_module = get_base_config("encrypt_module", False)
    private_key = get_base_config("private_key", None)

    if not password or not encrypt_password:
        return password

    if not private_key:
        raise ValueError("No private key")

    # Dynamically load the decryption function from "module#function" notation
    module_fun = encrypt_module.split("#")
    pwdecrypt_fun = getattr(
        importlib.import_module(
            module_fun[0]),
        module_fun[1])

    return pwdecrypt_fun(private_key, password)


def decrypt_database_config(database=None, passwd_key="password", name="database"):
    """Load and decrypt a database configuration block.

    For database-type configs, environment variables (``DB_HOST``, ``DB_PORT``,
    ``DB_NAME``, ``DB_USER``, ``DB_PASSWORD``) take precedence over YAML values.

    Args:
        database: Pre-loaded config dict, or None to load from YAML.
        passwd_key: Key within the config dict that holds the password.
        name: Config section name (e.g. ``"database"``, ``"mysql"``).

    Returns:
        Database config dict with the password decrypted.
    """
    if not database:
        database = get_base_config(name, {})

    # Allow environment variables to override YAML config (only for database, not redis/s3/etc.)
    if name in ("database", "postgres", "mysql"):
        env_overrides = {
            "host": os.environ.get("DB_HOST"),
            "port": os.environ.get("DB_PORT"),
            "name": os.environ.get("DB_NAME"),
            "user": os.environ.get("DB_USER"),
            "password": os.environ.get("DB_PASSWORD"),
        }
        for key, val in env_overrides.items():
            if val is not None:
                database[key] = int(val) if key == "port" else val

    database[passwd_key] = decrypt_database_password(database.get(passwd_key, ""))
    return database


def update_config(key, value, conf_name=SERVICE_CONF):
    """Atomically update a single key in the YAML config file.

    Uses a file lock to prevent concurrent writes from corrupting the file.

    Args:
        key: Config key to update.
        value: New value to set.
        conf_name: Config filename (default ``service_conf.yaml``).
    """
    conf_path = conf_realpath(conf_name=conf_name)
    if not os.path.isabs(conf_path):
        conf_path = os.path.join(get_project_base_directory(), conf_path)

    with FileLock(os.path.join(os.path.dirname(conf_path), ".lock")):
        config = load_yaml_conf(conf_path=conf_path) or {}
        config[key] = value
        rewrite_yaml_conf(conf_path=conf_path, config=config)
