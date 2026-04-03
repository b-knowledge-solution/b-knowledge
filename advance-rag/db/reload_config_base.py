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
Reload Configuration Base Module

Provides a base class for configuration classes that store their settings as
class-level attributes. Subclasses (e.g., RuntimeConfig) inherit introspection
methods to retrieve all or individual configuration values at runtime. This
pattern allows configurations to be dynamically reloaded without restarting
the application.
"""


class ReloadConfigBase:
    """Base class for introspectable configuration containers.

    Configuration values are stored as class attributes on subclasses.
    This base class provides classmethods to enumerate all public
    configuration keys or retrieve a single value by name.

    Attributes:
        Subclasses define their own class-level attributes representing
        configuration keys (e.g., DEBUG, HTTP_PORT, WORK_MODE).
    """

    @classmethod
    def get_all(cls):
        """Retrieve all public configuration values as a dictionary.

        Iterates over the class attributes and collects all non-callable,
        non-private attributes (those not starting with '_').

        Returns:
            dict: A dictionary mapping configuration names to their values.
        """
        configs = {}
        for k, v in cls.__dict__.items():
            if not callable(getattr(cls, k)) and not k.startswith(
                    "__") and not k.startswith("_"):
                configs[k] = v
        return configs

    @classmethod
    def get(cls, config_name):
        """Retrieve a single configuration value by name.

        Args:
            config_name (str): The name of the configuration attribute to retrieve.

        Returns:
            The configuration value if it exists, None otherwise.
        """
        return getattr(cls, config_name) if hasattr(cls, config_name) else None
