#!/usr/bin/env python3
"""
generate_summary.py — Phase 4 Report Generator

Reads results/eval_output.json (produced by promptfoo eval) and outputs:
  - A formatted summary table to stdout
  - results/eval_summary.md for sharing with non-technical stakeholders

Usage (inside Docker):
    python3 scripts/generate_summary.py

@description Phase 4 report generator — reads promptfoo JSON, writes Markdown summary
"""

import json
import os
import sys
from pathlib import Path
from collections import defaultdict
from typing import Dict, List, Any, Tuple

# ---------------------------------------------------------------------------
# Paths (container-absolute so the script works inside Docker)
# ---------------------------------------------------------------------------

RESULTS_FILE = Path("/app/results/eval_output.json")
SUMMARY_MD   = Path("/app/results/eval_summary.md")
SEPARATOR    = "─" * 56


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

def load_results() -> Dict[str, Any]:
    """
    Load and validate the promptfoo results JSON file.

    @returns: Parsed results dict
    @raises: SystemExit if the file is missing or contains malformed JSON
    """
    # Fail early with a clear message so the caller knows what to fix
    if not RESULTS_FILE.exists():
        print(f"ERROR: results file not found: {RESULTS_FILE}", file=sys.stderr)
        print("  Run: docker compose run --rm rag-evaluator promptfoo eval -c promptfooconfig.yaml",
              file=sys.stderr)
        sys.exit(1)

    try:
        with open(RESULTS_FILE, encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError as exc:
        print(f"ERROR: malformed JSON in {RESULTS_FILE}: {exc}", file=sys.stderr)
        sys.exit(1)


def extract_test_results(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Pull the list of individual test results from the promptfoo output.

    promptfoo output has two known shapes:
      Nested (v0.30+): { "results": { "results": [...], "stats": {...} } }
      Flat   (older) : { "results": [...] }

    @param data: Full parsed JSON from eval_output.json
    @returns: List of test result objects (may be empty)
    """
    inner = data.get("results", {})

    # Try nested format first (most common)
    if isinstance(inner, dict):
        nested = inner.get("results", [])
        if isinstance(nested, list):
            return nested

    # Fall back to flat list
    if isinstance(inner, list):
        return inner

    return []


# ---------------------------------------------------------------------------
# Computation helpers
# ---------------------------------------------------------------------------

def compute_pass_fail(results: List[Dict[str, Any]]) -> Tuple[int, int]:
    """
    Count how many tests passed vs failed.

    @param results: List of test result objects from promptfoo
    @returns: Tuple (passed_count, failed_count)
    """
    passed = sum(1 for r in results if r.get("success", False))
    return passed, len(results) - passed


def aggregate_metric_scores(results: List[Dict[str, Any]]) -> Dict[str, List[float]]:
    """
    Group assertion scores by metric/assertion type for per-metric averaging.

    @param results: List of test result objects
    @returns: Dict mapping assertion-type string → list of float scores
    """
    buckets: Dict[str, List[float]] = defaultdict(list)

    for r in results:
        # Each test result may contain multiple assertion results
        for assertion in r.get("assertResults", []):
            metric = assertion.get("type", "unknown")
            score  = assertion.get("score")
            # Only include numeric scores — some assertions return None
            if score is not None:
                buckets[metric].append(float(score))

    return dict(buckets)


def aggregate_by_category(results: List[Dict[str, Any]]) -> Dict[str, List[int]]:
    """
    Break down pass/fail counts per question category (from vars.category).

    @param results: List of test result objects
    @returns: Dict mapping category → [passed, failed]
    """
    categories: Dict[str, List[int]] = defaultdict(lambda: [0, 0])

    for r in results:
        cat = r.get("vars", {}).get("category", "")
        if not cat:
            continue
        # Index 0 = passed, index 1 = failed
        if r.get("success", False):
            categories[cat][0] += 1
        else:
            categories[cat][1] += 1

    return dict(categories)


def score_bar(score: float, width: int = 20) -> str:
    """
    ASCII bar visualization for a 0–1 score.

    @param score: Float between 0 and 1
    @param width: Total bar width in characters
    @returns: String like "████████░░░░░░░░░░░░"
    """
    filled = int(round(max(0.0, min(1.0, score)) * width))
    return "█" * filled + "░" * (width - filled)


# ---------------------------------------------------------------------------
# Output: stdout summary
# ---------------------------------------------------------------------------

def print_summary(results: List[Dict[str, Any]], passed: int, failed: int) -> None:
    """
    Print a formatted evaluation summary table to stdout.

    @param results: All test result objects
    @param passed: Number of passed tests
    @param failed: Number of failed tests
    """
    total     = passed + failed
    pass_rate = passed / total * 100 if total > 0 else 0.0

    print()
    print(SEPARATOR)
    print("  RAG Evaluation Report")
    print(SEPARATOR)
    print(f"  Total questions : {total}")
    print(f"  Passed          : {passed}  ({pass_rate:.1f}%)")
    print(f"  Failed          : {failed}  ({100.0 - pass_rate:.1f}%)")
    print()

    # Per-metric averages with visual bar
    buckets = aggregate_metric_scores(results)
    if buckets:
        print("  Metric averages:")
        for metric, scores in sorted(buckets.items()):
            avg = sum(scores) / len(scores)
            bar = score_bar(avg)
            print(f"    {metric:<24}  {avg:.3f}  {bar}")
        print()

    # Category breakdown
    categories = aggregate_by_category(results)
    if categories:
        print("  By category:")
        for cat, (p, f) in sorted(categories.items()):
            total_cat = p + f
            rate      = p / total_cat * 100 if total_cat > 0 else 0.0
            print(f"    {cat:<22}  {p}/{total_cat}  ({rate:.0f}%)")
        print()

    print(SEPARATOR)
    print()


# ---------------------------------------------------------------------------
# Output: Markdown report
# ---------------------------------------------------------------------------

def write_markdown(results: List[Dict[str, Any]], passed: int, failed: int) -> None:
    """
    Write eval_summary.md to /app/results/.

    @param results: All test result objects
    @param passed: Number of passed tests
    @param failed: Number of failed tests
    """
    total     = passed + failed
    pass_rate = passed / total * 100 if total > 0 else 0.0
    buckets   = aggregate_metric_scores(results)
    categories = aggregate_by_category(results)

    lines: List[str] = []

    # Header
    lines.append("# RAG Evaluation Summary\n")

    # Overall section
    lines.append("\n## Overall\n")
    lines.append("\n| Metric | Value |")
    lines.append("\n|---|---|")
    lines.append(f"\n| Total questions | {total} |")
    lines.append(f"\n| Passed | {passed} ({pass_rate:.1f}%) |")
    lines.append(f"\n| Failed | {failed} ({100.0 - pass_rate:.1f}%) |")

    # Metric averages section
    if buckets:
        lines.append("\n\n## Metric Averages\n")
        lines.append("\n| Metric | Score |")
        lines.append("\n|---|---|")
        for metric, scores in sorted(buckets.items()):
            avg = sum(scores) / len(scores)
            lines.append(f"\n| {metric} | {avg:.3f} |")

    # Category breakdown section
    if categories:
        lines.append("\n\n## By Category\n")
        lines.append("\n| Category | Passed | Total | Pass Rate |")
        lines.append("\n|---|---|---|---|")
        for cat, (p, f) in sorted(categories.items()):
            total_cat = p + f
            rate      = p / total_cat * 100 if total_cat > 0 else 0.0
            lines.append(f"\n| {cat} | {p} | {total_cat} | {rate:.0f}% |")

    lines.append("\n")

    # Ensure results directory exists before writing
    SUMMARY_MD.parent.mkdir(parents=True, exist_ok=True)
    with open(SUMMARY_MD, "w", encoding="utf-8") as f:
        f.writelines(lines)

    print(f"  Markdown report saved → {SUMMARY_MD}")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    """
    Load promptfoo results, print summary to stdout, write Markdown file.

    @description Main entry point for Phase 4 report generation
    """
    # Load raw JSON from promptfoo output
    data    = load_results()
    results = extract_test_results(data)

    if not results:
        print("WARNING: no test results found in eval_output.json", file=sys.stderr)
        sys.exit(0)

    passed, failed = compute_pass_fail(results)

    # Print human-readable summary to stdout
    print_summary(results, passed, failed)

    # Write Markdown report for sharing
    write_markdown(results, passed, failed)


if __name__ == "__main__":
    main()
