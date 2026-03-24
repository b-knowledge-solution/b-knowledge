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
"""User Canvas Version Service Module

Manages version snapshots for user canvases (agents). Supports listing,
creating, releasing, and pruning versions. Released versions are protected
from being overwritten by newer saves.
"""
import json
import logging
import time

from db.db_models import UserCanvasVersion, DB
from db.services.common_service import CommonService
from peewee import DoesNotExist


class UserCanvasVersionService(CommonService):
    """Service for managing canvas version history and release state.

    Attributes:
        model: The UserCanvasVersion Peewee model.
    """
    model = UserCanvasVersion

    @staticmethod
    def build_version_title(user_nickname: str, agent_title: str, ts: float | None = None) -> str:
        """Build a human-readable version title from user, agent, and timestamp.

        Args:
            user_nickname: Display name of the user creating the version.
            agent_title: Title of the agent/canvas.
            ts: Optional Unix timestamp; defaults to current time.

        Returns:
            Formatted version title string like "user_agent_2026-03-23 12:00:00".
        """
        tenant = str(user_nickname or "").strip() or "tenant"
        title = str(agent_title or "").strip() or "agent"
        stamp = (
            time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ts))
            if ts is not None
            else time.strftime("%Y-%m-%d %H:%M:%S")
        )
        return "{0}_{1}_{2}".format(tenant, title, stamp)

    @staticmethod
    def _normalize_dsl(dsl) -> dict:
        """Normalize DSL to a canonical dict form for comparison.

        Parses JSON strings and round-trips through serialization to ensure
        consistent key ordering and encoding.

        Args:
            dsl: DSL as a dict or JSON string.

        Returns:
            Normalized dict representation of the DSL.

        Raises:
            ValueError: If DSL is not valid JSON or not a dict.
        """
        normalized = dsl
        if isinstance(normalized, str):
            try:
                normalized = json.loads(normalized)
            except Exception as e:
                raise ValueError("Invalid DSL JSON string.") from e

        if not isinstance(normalized, dict):
            raise ValueError("DSL must be a JSON object.")

        try:
            return json.loads(json.dumps(normalized, ensure_ascii=False))
        except Exception as e:
            raise ValueError("DSL is not JSON-serializable.") from e

    @classmethod
    @DB.connection_context()
    def list_by_canvas_id(cls, user_canvas_id: str):
        """List all versions for a given canvas, excluding DSL for efficiency.

        Args:
            user_canvas_id: The parent canvas ID.

        Returns:
            peewee.ModelSelect or None: Query of version records, or None if error.
        """
        try:
            user_canvas_version = cls.model.select(
                *[cls.model.id,
                  cls.model.create_time,
                  cls.model.title,
                  cls.model.create_date,
                  cls.model.update_date,
                  cls.model.user_canvas_id,
                  cls.model.update_time,
                  cls.model.release]
            ).where(cls.model.user_canvas_id == user_canvas_id)
            return user_canvas_version
        except DoesNotExist:
            return None
        except Exception:
            return None

    @classmethod
    @DB.connection_context()
    def get_all_canvas_version_by_canvas_ids(cls, canvas_ids: list[str]) -> list[dict]:
        """Get all version IDs for multiple canvases, batched to avoid deep pagination.

        Args:
            canvas_ids: List of canvas IDs to query.

        Returns:
            List of version dicts containing only 'id' field.
        """
        fields = [cls.model.id]
        versions = cls.model.select(*fields).where(cls.model.user_canvas_id.in_(canvas_ids))
        versions.order_by(cls.model.create_time.asc())
        offset, limit = 0, 100
        res = []
        while True:
            version_batch = versions.offset(offset).limit(limit)
            _temp = list(version_batch.dicts())
            if not _temp:
                break
            res.extend(_temp)
            offset += limit
        return res

    @classmethod
    @DB.connection_context()
    def delete_all_versions(cls, user_canvas_id: str) -> bool | None:
        """Prune old unpublished versions, keeping only the 20 most recent.

        Released versions are always preserved regardless of count.

        Args:
            user_canvas_id: The parent canvas ID.

        Returns:
            True if pruning succeeded, None if error or no versions found.
        """
        try:
            # Only get unpublished versions (False or None), keep all released versions
            unpublished = (
                cls.model.select()
                .where(
                    cls.model.user_canvas_id == user_canvas_id,
                    (~cls.model.release) | (cls.model.release.is_null(True)),
                )
                .order_by(cls.model.create_time.desc())
            )

            # Only delete old unpublished versions beyond the retention limit
            if unpublished.count() > 20:
                delete_ids = [v.id for v in unpublished[20:]]
                cls.delete_by_ids(delete_ids)

            return True
        except DoesNotExist:
            return None
        except Exception:
            return None

    @classmethod
    @DB.connection_context()
    def _get_latest_by_canvas_id(cls, user_canvas_id: str, only_released: bool = False):
        """Get the latest version for a canvas, optionally filtered by release status.

        Args:
            user_canvas_id: The parent canvas ID.
            only_released: If True, only return released versions.

        Returns:
            UserCanvasVersion instance or None if not found.
        """
        try:
            query = cls.model.select().where(cls.model.user_canvas_id == user_canvas_id)
            if only_released:
                # Filter to only released versions for production use
                query = query.where(cls.model.release)
            return query.order_by(cls.model.create_time.desc()).first()
        except DoesNotExist:
            return None
        except Exception as e:
            logging.exception(e)
            return None

    @classmethod
    def get_latest_released(cls, user_canvas_id: str):
        """Get the latest released version for a canvas.

        Args:
            user_canvas_id: The parent canvas ID.

        Returns:
            UserCanvasVersion instance or None if no released version exists.
        """
        return cls._get_latest_by_canvas_id(user_canvas_id, only_released=True)

    @classmethod
    def get_latest_version_title(cls, user_canvas_id: str, release_mode: bool = False) -> str | None:
        """Get the version title for a canvas based on release mode.

        Args:
            user_canvas_id: The canvas ID.
            release_mode: If True, get the latest released version title;
                         if False, get the latest version title regardless of release status.

        Returns:
            Version title string or None if no matching version exists.
        """
        latest = cls._get_latest_by_canvas_id(user_canvas_id, only_released=release_mode)
        return latest.title if latest else None

    @classmethod
    @DB.connection_context()
    def save_or_replace_latest(cls, user_canvas_id: str, dsl, title: str | None = None,
                                description: str | None = None, release: bool | None = None):
        """Persist a canvas snapshot into version history.

        If the latest version has the same DSL content, updates that version in place
        instead of creating a new row. Released versions are protected: if the latest
        is released and the current save is not, a new version is created.

        Args:
            user_canvas_id: The parent canvas ID.
            dsl: Canvas DSL as dict or JSON string.
            title: Optional version title.
            description: Optional version description.
            release: Optional release flag.

        Returns:
            tuple: (version_id_or_None, was_created_bool_or_None).
                   Returns (None, None) on error.
        """
        try:
            normalized_dsl = cls._normalize_dsl(dsl)
            latest = (
                cls.model.select()
                .where(cls.model.user_canvas_id == user_canvas_id)
                .order_by(cls.model.create_time.desc())
                .first()
            )

            if latest and cls._normalize_dsl(latest.dsl) == normalized_dsl:
                # Protect released version: create new version instead of updating
                if latest.release and not release:
                    insert_data = {"user_canvas_id": user_canvas_id, "dsl": normalized_dsl}
                    if title is not None:
                        insert_data["title"] = title
                    if description is not None:
                        insert_data["description"] = description
                    if release is not None:
                        insert_data["release"] = release
                    cls.insert(**insert_data)
                    cls.delete_all_versions(user_canvas_id)
                    return None, True

                # DSL unchanged: update metadata only, preserve version title identity
                update_data = {"dsl": normalized_dsl}
                if description is not None:
                    update_data["description"] = description
                if release is not None:
                    update_data["release"] = release
                cls.update_by_id(latest.id, update_data)
                cls.delete_all_versions(user_canvas_id)
                return latest.id, False

            # DSL changed: create a new version snapshot
            insert_data = {"user_canvas_id": user_canvas_id, "dsl": normalized_dsl}
            if title is not None:
                insert_data["title"] = title
            if description is not None:
                insert_data["description"] = description
            if release is not None:
                insert_data["release"] = release
            cls.insert(**insert_data)
            cls.delete_all_versions(user_canvas_id)
            return None, True
        except Exception as e:
            logging.exception(e)
            return None, None
