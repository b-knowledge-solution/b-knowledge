"""
Code Graph RAG - Lua Language Handler

Handles Lua-specific function naming via dot_index_expression
and function_definition node types.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from .. import constants as cs
from .base import BaseLanguageHandler

if TYPE_CHECKING:
    from tree_sitter import Node


class LuaHandler(BaseLanguageHandler):
    """Lua specific handler."""
    __slots__ = ()

    def extract_function_name(self, node: Node) -> str | None:
        """Extract Lua function name, handling function_definition assignments."""
        if (name_node := node.child_by_field_name(cs.TS_FIELD_NAME)) and name_node.text:
            from ..parsers.utils import safe_decode_text
            return safe_decode_text(name_node)

        if node.type == cs.TS_LUA_FUNCTION_DEFINITION:
            from ..lua import utils as lua_utils
            return lua_utils.extract_assigned_name(
                node, accepted_var_types=(cs.TS_DOT_INDEX_EXPRESSION, cs.TS_IDENTIFIER)
            )

        return None
