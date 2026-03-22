"""Redis Streams consumer for agent node execution tasks.

Consumes tasks from the 'agent_execution_queue' Redis Stream using XREADGROUP
with consumer groups. Each task represents a single node execution within an
agent workflow graph. Results are published back to the Node.js orchestrator
via Redis pub/sub channels.

Queue and consumer group names must match:
- be/src/modules/agents/services/agent-redis.service.ts

Usage:
    python -m rag.agent.agent_consumer
"""

import json
import os
import signal
import sys
import time

from loguru import logger

from rag.utils.redis_conn import REDIS_CONN
from rag.agent.node_executor import execute_node

# Must match Node.js agent-redis.service.ts constants
AGENT_QUEUE = 'agent_execution_queue'
CONSUMER_GROUP = 'agent_task_broker'
CONSUMER_NAME = f'agent_worker_{os.getpid()}'
AGENT_RESULT_PREFIX = 'agent:run:'

# Graceful shutdown flag
_shutdown = False


def _signal_handler(signum, frame):
    """Handle SIGTERM/SIGINT for graceful shutdown.

    Args:
        signum: Signal number received.
        frame: Current stack frame (unused).
    """
    global _shutdown
    logger.info(f"Received signal {signum}, shutting down agent consumer...")
    _shutdown = True


def _ensure_consumer_group():
    """Create the consumer group on the agent queue if it does not exist.

    Uses MKSTREAM to auto-create the stream. Catches BUSYGROUP errors
    when the group was already created by another worker or the Node.js service.
    """
    try:
        REDIS_CONN.REDIS.xgroup_create(
            AGENT_QUEUE, CONSUMER_GROUP, id="0", mkstream=True
        )
        logger.info(f"Created consumer group '{CONSUMER_GROUP}' on '{AGENT_QUEUE}'")
    except Exception as e:
        if "BUSYGROUP" in str(e).upper():
            # Group already exists, that's fine
            logger.debug(f"Consumer group '{CONSUMER_GROUP}' already exists")
        else:
            logger.warning(f"Failed to create consumer group: {e}")


def _publish_node_result(run_id: str, node_id: str, result: dict):
    """Publish node execution result back to the Node.js orchestrator.

    The orchestrator subscribes to per-node result channels to know when
    a dispatched node has completed or failed.

    Args:
        run_id: Agent run UUID.
        node_id: Node identifier from the DSL graph.
        result: Execution result dict with 'output_data' or 'error' key.
    """
    channel = f"{AGENT_RESULT_PREFIX}{run_id}:node:{node_id}:result"
    try:
        REDIS_CONN.REDIS.publish(channel, json.dumps(result, ensure_ascii=False))
        logger.debug(f"Published result to {channel}")
    except Exception as e:
        logger.error(f"Failed to publish node result: {e}")


def _publish_run_output(run_id: str, data: dict):
    """Publish streaming output data for SSE forwarding to the client.

    The Node.js SSE stream subscribes to this channel and forwards
    delta events to the browser.

    Args:
        run_id: Agent run UUID.
        data: Output data payload to broadcast.
    """
    channel = f"{AGENT_RESULT_PREFIX}{run_id}:output"
    try:
        REDIS_CONN.REDIS.publish(channel, json.dumps(data, ensure_ascii=False))
    except Exception as e:
        logger.error(f"Failed to publish run output: {e}")


def consume_agent_tasks():
    """Main consumer loop: read and process agent node tasks from Redis Streams.

    Blocks on XREADGROUP with a 5-second timeout. For each received task:
    1. Parse the JSON message payload
    2. Check for cancellation signal
    3. Dispatch to node_executor.execute_node()
    4. Publish result back via Redis pub/sub
    5. XACK the message to mark it as processed

    On exception, publishes an error result and XACKs anyway to prevent
    redelivery loops. Runs until SIGTERM/SIGINT sets the shutdown flag.
    """
    global _shutdown

    # Register signal handlers for graceful shutdown
    signal.signal(signal.SIGTERM, _signal_handler)
    signal.signal(signal.SIGINT, _signal_handler)

    # Ensure consumer group exists before starting
    _ensure_consumer_group()

    logger.info(
        f"Agent consumer started: queue={AGENT_QUEUE}, "
        f"group={CONSUMER_GROUP}, consumer={CONSUMER_NAME}"
    )

    while not _shutdown:
        try:
            # XREADGROUP with 5-second block timeout
            messages = REDIS_CONN.REDIS.xreadgroup(
                groupname=CONSUMER_GROUP,
                consumername=CONSUMER_NAME,
                streams={AGENT_QUEUE: ">"},
                count=1,
                block=5000,
            )

            # No messages received within timeout, loop again
            if not messages:
                continue

            # Process each message from the stream
            stream_name, element_list = messages[0]
            if not element_list:
                continue

            for msg_id, payload in element_list:
                task = None
                try:
                    # Parse the JSON task from the message envelope
                    raw_message = payload.get("message", "{}")
                    task = json.loads(raw_message)

                    run_id = task.get("run_id", "")
                    node_id = task.get("node_id", "")
                    node_type = task.get("node_type", "unknown")

                    logger.info(
                        f"Processing agent task: run={run_id}, "
                        f"node={node_id}, type={node_type}"
                    )

                    # Check for cancellation before executing
                    cancel_key = f"agent:run:{run_id}:cancel"
                    if REDIS_CONN.REDIS.exists(cancel_key):
                        logger.info(f"Run {run_id} cancelled, skipping node {node_id}")
                        result = {"error": "Run cancelled", "cancelled": True}
                        _publish_node_result(run_id, node_id, result)
                        REDIS_CONN.REDIS.xack(AGENT_QUEUE, CONSUMER_GROUP, msg_id)
                        continue

                    # Publish step start event for SSE streaming
                    _publish_run_output(run_id, {
                        "type": "step_executing",
                        "node_id": node_id,
                        "node_type": node_type,
                    })

                    # Execute the node via the dispatch table
                    start_time = time.time()
                    result = execute_node(task)
                    duration_ms = int((time.time() - start_time) * 1000)

                    # Add execution metadata to result
                    result["duration_ms"] = duration_ms
                    result["node_id"] = node_id

                    logger.info(
                        f"Completed agent task: run={run_id}, "
                        f"node={node_id}, duration={duration_ms}ms"
                    )

                    # Publish result back to the orchestrator
                    _publish_node_result(run_id, node_id, result)

                except Exception as e:
                    logger.exception(f"Error processing agent task: {e}")

                    # Publish error result so orchestrator doesn't hang
                    if task:
                        run_id = task.get("run_id", "")
                        node_id = task.get("node_id", "")
                        error_result = {"error": str(e), "node_id": node_id}
                        _publish_node_result(run_id, node_id, error_result)

                finally:
                    # Always XACK to prevent redelivery loops
                    try:
                        REDIS_CONN.REDIS.xack(AGENT_QUEUE, CONSUMER_GROUP, msg_id)
                    except Exception as ack_err:
                        logger.warning(f"Failed to XACK message {msg_id}: {ack_err}")

        except Exception as e:
            # Catch-all for XREADGROUP failures (connection issues, etc.)
            if not _shutdown:
                logger.error(f"Agent consumer error: {e}")
                time.sleep(1)

    logger.info("Agent consumer stopped")


if __name__ == "__main__":
    consume_agent_tasks()
