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
"""Base classes for the RAG processing flow pipeline.

Provides ProcessParamBase and ProcessBase, the foundational abstractions
for all pipeline processing components (Parser, Splitter, Tokenizer,
Extractor, etc.). Each component runs as an async invocable with timeout
control, error handling, and progress callback support.
"""

import asyncio
import logging
import os
import time
from functools import partial
from typing import Any
from agent.component.base import ComponentBase, ComponentParamBase
from common.connection_utils import timeout


class ProcessParamBase(ComponentParamBase):
    """Base parameter class for pipeline processing components.

    Provides default timeout and logging configuration shared by
    all pipeline component parameters.

    Attributes:
        timeout: Maximum execution time in seconds.
        persist_logs: Whether to persist execution logs.
    """
    def __init__(self):
        super().__init__()
        self.timeout = 100000000
        self.persist_logs = True


class ProcessBase(ComponentBase):
    """Base class for all pipeline processing components.

    Provides the invoke/execute lifecycle with timeout control,
    error handling, exception defaults, and progress callbacks.
    Subclasses must implement the _invoke async method.

    Attributes:
        callback: Partial function for reporting progress to the pipeline.
    """
    def __init__(self, pipeline, id, param: ProcessParamBase):
        super().__init__(pipeline, id, param)
        if hasattr(self._canvas, "callback"):
            self.callback = partial(self._canvas.callback, id)
        else:
            self.callback = partial(lambda *args, **kwargs: None, id)

    async def invoke(self, **kwargs) -> dict[str, Any]:
        """Execute the component with timeout and error handling.

        Sets up timing, delegates to _invoke, handles exceptions,
        and records elapsed time.

        Args:
            **kwargs: Input parameters passed from the upstream component.

        Returns:
            Dictionary of output values produced by this component.
        """
        self.set_output("_created_time", time.perf_counter())
        for k, v in kwargs.items():
            self.set_output(k, v)
        try:
            await asyncio.wait_for(
                self._invoke(**kwargs),
                timeout=self._param.timeout
            )
            self.callback(1, "Done")
        except Exception as e:
            if self.get_exception_default_value():
                self.set_exception_default_value()
            else:
                self.set_output("_ERROR", str(e))
            logging.exception(e)
            self.callback(-1, str(e))
        self.set_output("_elapsed_time", time.perf_counter() - self.output("_created_time"))
        return self.output()

    @timeout(int(os.environ.get("COMPONENT_EXEC_TIMEOUT", 10 * 60)))
    async def _invoke(self, **kwargs):
        """Abstract method to be implemented by subclasses.

        Contains the actual processing logic for this component.
        Decorated with a configurable timeout.

        Args:
            **kwargs: Input parameters from upstream.

        Raises:
            NotImplementedError: Must be overridden by subclasses.
        """
        raise NotImplementedError()
