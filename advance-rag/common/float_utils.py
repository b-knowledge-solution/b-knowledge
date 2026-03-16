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
Numeric conversion and normalisation helpers.

Provides safe float conversion (defaulting to negative infinity on failure)
and a normaliser for overlapped-percentage values used in chunking configuration.
"""


def get_float(v):
    """
    Convert a value to float, handling None and exceptions gracefully.

    Attempts to convert the input value to a float. If the value is None or
    cannot be converted to float, returns negative infinity as a default value.

    Args:
        v: The value to convert to float. Can be any type that float() accepts,
           or None.

    Returns:
        float: The converted float value if successful, otherwise float('-inf').

    Examples:
        >>> get_float("3.14")
        3.14
        >>> get_float(None)
        -inf
        >>> get_float("invalid")
        -inf
        >>> get_float(42)
        42.0
    """
    if v is None:
        return float("-inf")
    try:
        return float(v)
    except Exception:
        return float("-inf")


def normalize_overlapped_percent(overlapped_percent):
    """Normalise an overlap percentage into an integer in the range [0, 90].

    Handles inputs given as a decimal fraction (0 < x < 1) by multiplying
    by 100.  Non-numeric inputs are treated as 0.

    Args:
        overlapped_percent: Raw overlap value -- may be a float, int, string,
            or None.

    Returns:
        An integer between 0 and 90 (inclusive).
    """
    try:
        value = float(overlapped_percent)
    except (TypeError, ValueError):
        return 0
    # Treat values between 0 and 1 exclusive as fractional percentages
    if 0 < value < 1:
        value *= 100
    value = int(value)
    # Clamp to [0, 90]
    return max(0, min(value, 90))
