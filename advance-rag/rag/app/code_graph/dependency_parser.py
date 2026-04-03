"""
Code Graph RAG - Dependency Parser

Parses package manager files (package.json, Cargo.toml, pom.xml, go.mod,
pyproject.toml, etc.) to extract project dependencies and create
HAS_DEPENDENCY graph edges.

Ported from codebase_rag/parsers/dependency_parser.py.
"""
from __future__ import annotations

import json
from loguru import logger
import re
from pathlib import Path
from typing import TYPE_CHECKING

from . import constants as cs
from .models import GraphNode, GraphRelationship

if TYPE_CHECKING:
    from .services import IngestorProtocol




def parse_dependencies(
    file_path: Path,
    project_qn: str,
    ingestor: IngestorProtocol,
) -> list[str]:
    """
    Parse a package manifest file and create dependency nodes/edges.

    @param file_path: Path to the manifest file.
    @param project_qn: Project qualified name.
    @param ingestor: Graph ingestor.
    @returns: List of dependency names.
    """
    filename = file_path.name.lower()
    content = file_path.read_text(encoding="utf-8", errors="ignore")

    parser_map = {
        "package.json": _parse_package_json,
        "cargo.toml": _parse_cargo_toml,
        "go.mod": _parse_go_mod,
        "pyproject.toml": _parse_pyproject_toml,
        "requirements.txt": _parse_requirements_txt,
        "pom.xml": _parse_pom_xml,
        "build.gradle": _parse_gradle,
        "composer.json": _parse_composer_json,
    }

    parser = parser_map.get(filename)
    if not parser:
        return []

    try:
        deps = parser(content)
    except Exception as e:
        logger.warning(f"Failed to parse {file_path}: {e}")
        return []

    for dep_name in deps:
        dep_qn = f"dep:{dep_name}"
        ingestor.ensure_node(GraphNode(
            labels=["Dependency"],
            properties={
                cs.KEY_QUALIFIED_NAME: dep_qn,
                cs.KEY_NAME: dep_name,
            },
        ))
        ingestor.ensure_relationship(GraphRelationship(
            source_label=cs.NodeLabel.PROJECT,
            source_key=cs.KEY_QUALIFIED_NAME,
            source_value=project_qn,
            target_label="Dependency",
            target_key=cs.KEY_QUALIFIED_NAME,
            target_value=dep_qn,
            rel_type=cs.RelationshipType.HAS_DEPENDENCY,
        ))

    logger.info(f"Parsed {len(deps)} dependencies from {file_path.name}")
    return deps


def _parse_package_json(content: str) -> list[str]:
    """Parse npm package.json."""
    data = json.loads(content)
    deps: set[str] = set()
    for key in ("dependencies", "devDependencies", "peerDependencies"):
        if key in data and isinstance(data[key], dict):
            deps.update(data[key].keys())
    return sorted(deps)


def _parse_cargo_toml(content: str) -> list[str]:
    """Parse Rust Cargo.toml (simplified TOML parsing)."""
    deps: list[str] = []
    in_deps = False
    for line in content.splitlines():
        stripped = line.strip()
        if stripped.startswith("[") and "dependencies" in stripped.lower():
            in_deps = True
            continue
        if stripped.startswith("[") and in_deps:
            in_deps = False
            continue
        if in_deps and "=" in stripped:
            dep_name = stripped.split("=")[0].strip().strip('"')
            if dep_name:
                deps.append(dep_name)
    return deps


def _parse_go_mod(content: str) -> list[str]:
    """Parse Go go.mod."""
    deps: list[str] = []
    in_require = False
    for line in content.splitlines():
        stripped = line.strip()
        if stripped.startswith("require ("):
            in_require = True
            continue
        if in_require and stripped == ")":
            in_require = False
            continue
        if in_require and stripped:
            parts = stripped.split()
            if parts:
                deps.append(parts[0])
        elif stripped.startswith("require ") and "(" not in stripped:
            parts = stripped.split()
            if len(parts) >= 2:
                deps.append(parts[1])
    return deps


def _parse_pyproject_toml(content: str) -> list[str]:
    """Parse Python pyproject.toml (simplified)."""
    deps: list[str] = []
    in_deps = False
    for line in content.splitlines():
        stripped = line.strip()
        if stripped.startswith("dependencies") and "=" in stripped:
            in_deps = True
            continue
        if in_deps:
            if stripped.startswith("]"):
                in_deps = False
                continue
            match = re.match(r'["\']([a-zA-Z0-9_-]+)', stripped)
            if match:
                deps.append(match.group(1))
    return deps


def _parse_requirements_txt(content: str) -> list[str]:
    """Parse Python requirements.txt."""
    deps: list[str] = []
    for line in content.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or stripped.startswith("-"):
            continue
        match = re.match(r"([a-zA-Z0-9_.-]+)", stripped)
        if match:
            deps.append(match.group(1))
    return deps


def _parse_pom_xml(content: str) -> list[str]:
    """Parse Maven pom.xml (regex-based, no XML parser needed)."""
    deps: list[str] = []
    for match in re.finditer(
        r"<dependency>.*?<groupId>(.*?)</groupId>.*?<artifactId>(.*?)</artifactId>.*?</dependency>",
        content,
        re.DOTALL,
    ):
        deps.append(f"{match.group(1)}:{match.group(2)}")
    return deps


def _parse_gradle(content: str) -> list[str]:
    """Parse Gradle build.gradle (simplified)."""
    deps: list[str] = []
    for match in re.finditer(
        r"""(?:implementation|api|compile|testImplementation)\s*['"(]([^'")\s]+)""",
        content,
    ):
        deps.append(match.group(1))
    return deps


def _parse_composer_json(content: str) -> list[str]:
    """Parse PHP composer.json."""
    data = json.loads(content)
    deps: set[str] = set()
    for key in ("require", "require-dev"):
        if key in data and isinstance(data[key], dict):
            deps.update(data[key].keys())
    # Remove PHP extensions
    deps.discard("php")
    deps = {d for d in deps if not d.startswith("ext-")}
    return sorted(deps)
