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
"""Storage backend factory placeholder.

This module is reserved for the storage factory implementation that
selects and instantiates the appropriate storage backend (MinIO, S3,
GCS, Azure, OpenDAL, OSS) based on the application configuration.

The actual factory logic currently lives in common/settings.py where
STORAGE_IMPL is initialized based on the STORAGE_TYPE setting.
"""
