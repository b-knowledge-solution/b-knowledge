"""Sample Python module for testing the code-aware parser.

This module contains various Python constructs (functions, classes,
decorators, imports, docstrings) to validate AST-based chunking.
"""

import os
import sys
from typing import Optional, List
from dataclasses import dataclass


@dataclass
class UserProfile:
    """Data class representing a user profile."""
    name: str
    email: str
    age: int


def calculate_discount(price: float, tier: str) -> float:
    """Calculate the discount for a given price and customer tier.

    Args:
        price: Original item price.
        tier: Customer tier (gold, silver, bronze).

    Returns:
        Discounted price after applying tier-based reduction.
    """
    # Apply tier-based discount percentages
    if tier == "gold":
        return price * 0.8
    elif tier == "silver":
        return price * 0.9
    elif tier == "bronze":
        return price * 0.95
    return price


class OrderProcessor:
    """Processes customer orders with validation and inventory checks."""

    def __init__(self, warehouse_id: str):
        """Initialize the order processor.

        Args:
            warehouse_id: Identifier for the fulfillment warehouse.
        """
        self.warehouse_id = warehouse_id
        self.pending_orders: List[dict] = []

    def validate_order(self, order: dict) -> bool:
        """Validate an order has all required fields.

        Args:
            order: Order dictionary with items, customer_id, and shipping_address.

        Returns:
            True if the order is valid, False otherwise.
        """
        # Check all mandatory fields are present
        required = ["items", "customer_id", "shipping_address"]
        for field in required:
            if field not in order:
                return False
        # Ensure at least one item in the order
        if not order["items"]:
            return False
        return True

    @staticmethod
    def calculate_shipping(weight: float, distance: int) -> float:
        """Calculate shipping cost based on weight and distance.

        Args:
            weight: Package weight in kilograms.
            distance: Shipping distance in kilometers.

        Returns:
            Calculated shipping cost.
        """
        # Base rate plus per-km and per-kg surcharges
        base_rate = 5.0
        return base_rate + (weight * 0.5) + (distance * 0.01)


def process_large_dataset(
    data: List[dict],
    filters: Optional[dict] = None,
    batch_size: int = 100,
    max_retries: int = 3,
    enable_logging: bool = True,
    output_format: str = "json",
    compression: Optional[str] = None,
    validate: bool = True,
    transform_fn=None,
    error_handler=None,
) -> dict:
    """Process a large dataset with configurable batching, filtering, and transformation.

    This function handles datasets that may exceed memory limits by processing
    in configurable batches. It supports retry logic, validation, and custom
    transformation functions.

    Args:
        data: List of data records to process.
        filters: Optional filter criteria to apply before processing.
        batch_size: Number of records per processing batch.
        max_retries: Maximum retry attempts for failed batches.
        enable_logging: Whether to log processing progress.
        output_format: Output serialization format (json, csv, parquet).
        compression: Optional compression algorithm (gzip, lz4, zstd).
        validate: Whether to validate each record before processing.
        transform_fn: Optional custom transformation function.
        error_handler: Optional error handling callback.

    Returns:
        Dictionary with processed_count, error_count, and output_path.
    """
    results = {"processed_count": 0, "error_count": 0, "output_path": ""}
    filtered_data = data

    # Apply filters if provided to reduce the working set
    if filters:
        filtered_data = []
        for record in data:
            match = True
            for key, value in filters.items():
                if record.get(key) != value:
                    match = False
                    break
            if match:
                filtered_data.append(record)

    # Process in batches to avoid memory exhaustion
    total_batches = (len(filtered_data) + batch_size - 1) // batch_size
    for batch_idx in range(total_batches):
        start = batch_idx * batch_size
        end = min(start + batch_size, len(filtered_data))
        batch = filtered_data[start:end]

        # Retry logic for transient failures
        for attempt in range(max_retries):
            try:
                # Validate each record in the batch if enabled
                if validate:
                    valid_records = []
                    for record in batch:
                        if "id" in record and "data" in record:
                            valid_records.append(record)
                        else:
                            results["error_count"] += 1
                            if enable_logging:
                                log_msg = f"Invalid record in batch {batch_idx}"
                                print(log_msg)
                    batch = valid_records

                # Apply custom transformation if provided
                if transform_fn:
                    batch = [transform_fn(r) for r in batch]

                # Serialize based on output format
                if output_format == "json":
                    import json
                    serialized = json.dumps(batch)
                elif output_format == "csv":
                    serialized = "\n".join(
                        ",".join(str(v) for v in r.values()) for r in batch
                    )
                else:
                    serialized = str(batch)

                # Apply compression if specified
                if compression == "gzip":
                    import gzip
                    compressed = gzip.compress(serialized.encode())
                elif compression == "lz4":
                    compressed = serialized.encode()
                elif compression == "zstd":
                    compressed = serialized.encode()
                else:
                    compressed = serialized.encode() if isinstance(serialized, str) else serialized

                # Write output chunk
                chunk_path = f"/tmp/output_batch_{batch_idx}.{output_format}"
                with open(chunk_path, "wb") as f:
                    f.write(compressed if isinstance(compressed, bytes) else compressed.encode())

                results["processed_count"] += len(batch)

                if enable_logging:
                    progress = (batch_idx + 1) / total_batches * 100
                    print(f"Progress: {progress:.1f}% - Batch {batch_idx + 1}/{total_batches}")

                # Success - break retry loop
                break

            except Exception as e:
                if error_handler:
                    error_handler(e, batch_idx, attempt)
                if attempt == max_retries - 1:
                    results["error_count"] += len(batch)
                    if enable_logging:
                        print(f"Batch {batch_idx} failed after {max_retries} retries: {e}")

    # Generate final output path
    results["output_path"] = f"/tmp/output_final.{output_format}"

    # Log completion summary
    if enable_logging:
        total = results["processed_count"] + results["error_count"]
        success_rate = results["processed_count"] / max(total, 1) * 100
        print(f"Complete: {results['processed_count']}/{total} records ({success_rate:.1f}% success)")

    return results
