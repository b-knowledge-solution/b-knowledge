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
"""Pydantic schema for validating Parser component upstream inputs.

Defines the expected data shape for the Parser component, which receives
file name and metadata from the upstream File component.
"""

from pydantic import BaseModel, ConfigDict, Field


class ParserFromUpstream(BaseModel):
    """Schema for data flowing into the Parser from the File component.

    Attributes:
        name: Original filename of the document to parse.
        file: File metadata dict (for upload-based processing).
        abstract: Whether to extract abstract from the document.
        author: Whether to extract author information.
    """
    created_time: float | None = Field(default=None, alias="_created_time")
    elapsed_time: float | None = Field(default=None, alias="_elapsed_time")

    name: str
    file: dict | None = Field(default=None)
    abstract: bool = False
    author: bool = False
    model_config = ConfigDict(populate_by_name=True, extra="forbid")
