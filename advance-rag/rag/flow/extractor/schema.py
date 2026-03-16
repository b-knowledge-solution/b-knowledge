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
"""Pydantic schema for validating Extractor component upstream inputs.

Defines the expected shape of data passed from upstream pipeline components
(e.g., Parser, Splitter) to the Extractor. Supports multiple output formats
including JSON, markdown, text, HTML, and chunks.
"""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class ExtractorFromUpstream(BaseModel):
    """Schema for data flowing into the Extractor from upstream components.

    Validates and normalizes the upstream output format, ensuring
    the Extractor receives data in a consistent structure.

    Attributes:
        name: Original filename of the document.
        file: File metadata dict (for upload-based processing).
        chunks: List of chunk dicts with text and metadata.
        output_format: Format of the upstream output data.
    """
    created_time: float | None = Field(default=None, alias="_created_time")
    elapsed_time: float | None = Field(default=None, alias="_elapsed_time")

    name: str
    file: dict | None = Field(default=None)
    chunks: list[dict[str, Any]] | None = Field(default=None)

    output_format: Literal["json", "markdown", "text", "html", "chunks"] | None = Field(default=None)

    json_result: list[dict[str, Any]] | None = Field(default=None, alias="json")
    markdown_result: str | None = Field(default=None, alias="markdown")
    text_result: str | None = Field(default=None, alias="text")
    html_result: str | None = Field(default=None, alias="html")

    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    # def to_dict(self, *, exclude_none: bool = True) -> dict:
    #     return self.model_dump(by_alias=True, exclude_none=exclude_none)
