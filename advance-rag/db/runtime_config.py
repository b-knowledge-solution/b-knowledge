#
#  Copyright 2024 The InfiniFlow Authors. All Rights Reserved.
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
Runtime Configuration Module

Extends ReloadConfigBase to hold runtime-specific settings such as debug mode,
work mode, HTTP port, environment variables (including application version),
and database service references. These values are typically initialized once
at startup and can be read throughout the application lifecycle.
"""
from common.versions import get_ragflow_version
from .reload_config_base import ReloadConfigBase


class RuntimeConfig(ReloadConfigBase):
    """Runtime configuration container for the RAG worker.

    Stores application-wide runtime settings as class-level attributes.
    Values are initialized via init_config() and init_env() during startup.

    Attributes:
        DEBUG: Whether debug mode is enabled.
        WORK_MODE: The operational work mode of the application.
        HTTP_PORT: The HTTP port the server listens on.
        JOB_SERVER_HOST: Hostname of the job server.
        JOB_SERVER_VIP: Virtual IP of the job server.
        ENV: Dictionary of environment metadata (e.g., version).
        SERVICE_DB: Reference to the service database instance.
        LOAD_CONFIG_MANAGER: Whether the config manager has been loaded.
    """
    DEBUG = None
    WORK_MODE = None
    HTTP_PORT = None
    JOB_SERVER_HOST = None
    JOB_SERVER_VIP = None
    ENV = dict()
    SERVICE_DB = None
    LOAD_CONFIG_MANAGER = False

    @classmethod
    def init_config(cls, **kwargs):
        """Initialize configuration from keyword arguments.

        Sets class attributes for any key that already exists as a class
        attribute, ignoring unknown keys.

        Args:
            **kwargs: Configuration key-value pairs to set.
        """
        for k, v in kwargs.items():
            if hasattr(cls, k):
                setattr(cls, k, v)

    @classmethod
    def init_env(cls):
        """Initialize environment metadata.

        Populates the ENV dictionary with the current application version
        obtained from the version utility.
        """
        # cls.ENV.update({"version": get_ragflow_version()})
        pass

    @classmethod
    def load_config_manager(cls):
        """Mark the configuration manager as loaded."""
        cls.LOAD_CONFIG_MANAGER = True

    @classmethod
    def get_env(cls, key):
        """Retrieve a single environment metadata value.

        Args:
            key (str): The environment key to look up.

        Returns:
            The value associated with the key, or None if not found.
        """
        return cls.ENV.get(key, None)

    @classmethod
    def get_all_env(cls):
        """Retrieve all environment metadata.

        Returns:
            dict: The full ENV dictionary.
        """
        return cls.ENV

    @classmethod
    def set_service_db(cls, service_db):
        """Set the service database reference.

        Args:
            service_db: The database service instance to store.
        """
        cls.SERVICE_DB = service_db
