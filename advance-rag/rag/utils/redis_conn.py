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
"""Redis/Valkey connection manager and message queue client.

Provides singleton RedisDB and RedisDistributedLock classes for all Redis
operations in the RAG pipeline. Handles key-value storage, sorted sets,
stream-based message queues (XADD/XREADGROUP), distributed locking,
auto-increment ID generation, and Lua-script-based atomic operations
(conditional delete, token bucket rate limiting).

The module-level REDIS_CONN singleton is imported throughout the codebase
for direct Redis access.
"""

import asyncio
import logging
import json
import uuid

import valkey as redis
from common.decorator import singleton
from common import settings
from valkey.lock import Lock

REDIS = {}
try:
    REDIS = settings.decrypt_database_config(name="redis")
except Exception:
    try:
        REDIS = settings.get_base_config("redis", {})
    except Exception:
        REDIS = {}


class RedisMsg:
    """Wrapper for a Redis Stream message with acknowledgement support.

    Encapsulates a message consumed from a Redis stream consumer group,
    providing methods to acknowledge processing and access the parsed payload.

    Attributes:
        __consumer: Redis client for sending XACK.
        __queue_name: Stream key name.
        __group_name: Consumer group name.
        __msg_id: Redis stream message ID.
        __message: Parsed JSON message payload.
    """

    def __init__(self, consumer, queue_name, group_name, msg_id, message):
        self.__consumer = consumer
        self.__queue_name = queue_name
        self.__group_name = group_name
        self.__msg_id = msg_id
        self.__message = json.loads(message["message"])

    def ack(self):
        """Acknowledge the message as processed in the consumer group.

        Returns:
            True on success, False on failure.
        """
        try:
            self.__consumer.xack(self.__queue_name, self.__group_name, self.__msg_id)
            return True
        except Exception as e:
            logging.warning("[EXCEPTION]ack" + str(self.__queue_name) + "||" + str(e))
        return False

    def get_message(self):
        """Return the parsed message payload dict."""
        return self.__message

    def get_msg_id(self):
        """Return the Redis stream message ID."""
        return self.__msg_id


@singleton
class RedisDB:
    """Singleton Redis client providing key-value, sorted set, stream, and scripting operations.

    Manages a persistent Redis connection with automatic reconnection on failures.
    Registers Lua scripts for atomic operations (conditional delete, token bucket
    rate limiting) on initialization.

    Attributes:
        REDIS: The underlying StrictRedis client instance.
        config: Redis configuration dict (host, port, password, db).
    """

    lua_delete_if_equal = None
    lua_token_bucket = None
    LUA_DELETE_IF_EQUAL_SCRIPT = """
        local current_value = redis.call('get', KEYS[1])
        if current_value and current_value == ARGV[1] then
            redis.call('del', KEYS[1])
            return 1
        end
        return 0
    """

    LUA_TOKEN_BUCKET_SCRIPT = """
        -- KEYS[1] = rate limit key
        -- ARGV[1] = capacity
        -- ARGV[2] = rate
        -- ARGV[3] = now
        -- ARGV[4] = cost

        local key       = KEYS[1]
        local capacity  = tonumber(ARGV[1])
        local rate      = tonumber(ARGV[2])
        local now       = tonumber(ARGV[3])
        local cost      = tonumber(ARGV[4])

        local data = redis.call("HMGET", key, "tokens", "timestamp")
        local tokens = tonumber(data[1])
        local last_ts = tonumber(data[2])

        if tokens == nil then
            tokens = capacity
            last_ts = now
        end

        local delta = math.max(0, now - last_ts)
        tokens = math.min(capacity, tokens + delta * rate)

        if tokens < cost then
            return {0, tokens}
        end

        tokens = tokens - cost

        redis.call("HMSET", key,
            "tokens", tokens,
            "timestamp", now
        )

        redis.call("EXPIRE", key, math.ceil(capacity / rate * 2))

        return {1, tokens}
    """

    def __init__(self):
        self.REDIS = None
        self.config = REDIS
        self.__open__()

    def register_scripts(self) -> None:
        cls = self.__class__
        client = self.REDIS
        cls.lua_delete_if_equal = client.register_script(cls.LUA_DELETE_IF_EQUAL_SCRIPT)
        cls.lua_token_bucket = client.register_script(cls.LUA_TOKEN_BUCKET_SCRIPT)

    def __open__(self):
        try:
            # Parse host — may be "host:port" or just "host"
            raw_host = self.config.get("host", "localhost")
            if ":" in str(raw_host):
                host = str(raw_host).split(":")[0]
                port = int(str(raw_host).split(":")[1])
            else:
                host = str(raw_host)
                port = int(self.config.get("port", 6379))
            conn_params = {
                "host": host,
                "port": port,
                "db": int(self.config.get("db", 1)),
                "decode_responses": True,
            }
            username = self.config.get("username")
            if username:
                conn_params["username"] = username
            password = self.config.get("password")
            if password:
                conn_params["password"] = password

            self.REDIS = redis.StrictRedis(**conn_params)

            self.register_scripts()
        except Exception as e:
            logging.warning(f"Redis can't be connected. Error: {str(e)}")
        return self.REDIS

    def health(self):
        self.REDIS.ping()
        a, b = "xx", "yy"
        self.REDIS.set(a, b, 3)

        if self.REDIS.get(a) == b:
            return True
        return False

    def info(self):
        info = self.REDIS.info()
        return {
            'redis_version': info["redis_version"],
            'server_mode': info["server_mode"] if "server_mode" in info else info.get("redis_mode", ""),
            'used_memory': info["used_memory_human"],
            'total_system_memory': info["total_system_memory_human"],
            'mem_fragmentation_ratio': info["mem_fragmentation_ratio"],
            'connected_clients': info["connected_clients"],
            'blocked_clients': info["blocked_clients"],
            'instantaneous_ops_per_sec': info["instantaneous_ops_per_sec"],
            'total_commands_processed': info["total_commands_processed"]
        }

    def is_alive(self):
        return self.REDIS is not None

    def exist(self, k):
        if not self.REDIS:
            return None
        try:
            return self.REDIS.exists(k)
        except Exception as e:
            logging.warning("RedisDB.exist " + str(k) + " got exception: " + str(e))
            self.__open__()

    def get(self, k):
        if not self.REDIS:
            return None
        try:
            return self.REDIS.get(k)
        except Exception as e:
            logging.warning("RedisDB.get " + str(k) + " got exception: " + str(e))
            self.__open__()

    def set_obj(self, k, obj, exp=3600):
        try:
            self.REDIS.set(k, json.dumps(obj, ensure_ascii=False), exp)
            return True
        except Exception as e:
            logging.warning("RedisDB.set_obj " + str(k) + " got exception: " + str(e))
            self.__open__()
        return False

    def set(self, k, v, exp=3600):
        try:
            self.REDIS.set(k, v, exp)
            return True
        except Exception as e:
            logging.warning("RedisDB.set " + str(k) + " got exception: " + str(e))
            self.__open__()
        return False

    def sadd(self, key: str, member: str):
        try:
            self.REDIS.sadd(key, member)
            return True
        except Exception as e:
            logging.warning("RedisDB.sadd " + str(key) + " got exception: " + str(e))
            self.__open__()
        return False

    def srem(self, key: str, member: str):
        try:
            self.REDIS.srem(key, member)
            return True
        except Exception as e:
            logging.warning("RedisDB.srem " + str(key) + " got exception: " + str(e))
            self.__open__()
        return False

    def smembers(self, key: str):
        try:
            res = self.REDIS.smembers(key)
            return res
        except Exception as e:
            logging.warning(
                "RedisDB.smembers " + str(key) + " got exception: " + str(e)
            )
            self.__open__()
        return None

    def zadd(self, key: str, member: str, score: float):
        try:
            self.REDIS.zadd(key, {member: score})
            return True
        except Exception as e:
            logging.warning("RedisDB.zadd " + str(key) + " got exception: " + str(e))
            self.__open__()
        return False

    def zcount(self, key: str, min: float, max: float):
        try:
            res = self.REDIS.zcount(key, min, max)
            return res
        except Exception as e:
            logging.warning("RedisDB.zcount " + str(key) + " got exception: " + str(e))
            self.__open__()
        return 0

    def zpopmin(self, key: str, count: int):
        try:
            res = self.REDIS.zpopmin(key, count)
            return res
        except Exception as e:
            logging.warning("RedisDB.zpopmin " + str(key) + " got exception: " + str(e))
            self.__open__()
        return None

    def zrangebyscore(self, key: str, min: float, max: float):
        try:
            res = self.REDIS.zrangebyscore(key, min, max)
            return res
        except Exception as e:
            logging.warning(
                "RedisDB.zrangebyscore " + str(key) + " got exception: " + str(e)
            )
            self.__open__()
        return None

    def zremrangebyscore(self, key: str, min: float, max: float):
        try:
            res = self.REDIS.zremrangebyscore(key, min, max)
            return res
        except Exception as e:
            logging.warning(
                f"RedisDB.zremrangebyscore {key} got exception: {e}"
            )
            self.__open__()
        return 0

    def incrby(self, key: str, increment: int):
        return self.REDIS.incrby(key, increment)

    def decrby(self, key: str, decrement: int):
        return self.REDIS.decrby(key, decrement)

    def generate_auto_increment_id(self, key_prefix: str = "id_generator", namespace: str = "default",
                                   increment: int = 1, ensure_minimum: int | None = None) -> int:
        redis_key = f"{key_prefix}:{namespace}"

        try:
            # Use pipeline for atomicity
            pipe = self.REDIS.pipeline()

            # Check if key exists
            pipe.exists(redis_key)

            # Get/Increment
            if ensure_minimum is not None:
                # Ensure minimum value
                pipe.get(redis_key)
                results = pipe.execute()

                if results[0] == 0:  # Key doesn't exist
                    start_id = max(1, ensure_minimum)
                    pipe.set(redis_key, start_id)
                    pipe.execute()
                    return start_id
                else:
                    current = int(results[1])
                    if current < ensure_minimum:
                        pipe.set(redis_key, ensure_minimum)
                        pipe.execute()
                        return ensure_minimum

            # Increment operation
            next_id = self.REDIS.incrby(redis_key, increment)

            # If it's the first time, set a reasonable initial value
            if next_id == increment:
                self.REDIS.set(redis_key, 1 + increment)
                return 1 + increment

            return next_id

        except Exception as e:
            logging.warning("RedisDB.generate_auto_increment_id got exception: " + str(e))
            self.__open__()
        return -1

    def get_or_create_secret_key(self, key_name: str, new_value: str) -> str:
        """
        Atomically get an existing key or create a new one.

        This method guarantees that across multiple concurrent calls, only one
        key will be created and all callers will receive the same key.

        Returns:
            The secret key string

        Raises:
            redis.RedisError: If Redis operations fail
        """
        # First, try to get the existing key
        existing_value = self.REDIS.get(key_name)
        if existing_value is not None:
            logging.debug("Retrieved existing key from Redis")
            return existing_value

        # Use SETNX to atomically set the key only if it doesn't exist
        # SETNX returns True if the key was set, False if it already existed
        if self.REDIS.setnx(key_name, new_value):
            logging.info("Successfully created new secret key in Redis")
            return new_value

        # SETNX failed, meaning another process created the key concurrently
        # Retrieve and return that key
        final_key = self.REDIS.get(key_name)
        if final_key is None:
            # This should rarely happen, but retry if it does
            logging.warning("Key disappeared during concurrent access, retrying...")
            return self.get_or_create_secret_key(key_name, new_value)

        logging.debug("Retrieved key created by another process")
        return final_key

    def transaction(self, key, value, exp=3600):
        try:
            pipeline = self.REDIS.pipeline(transaction=True)
            pipeline.set(key, value, exp, nx=True)
            pipeline.execute()
            return True
        except Exception as e:
            logging.warning(
                "RedisDB.transaction " + str(key) + " got exception: " + str(e)
            )
            self.__open__()
        return False

    def queue_product(self, queue, message) -> bool:
        for _ in range(3):
            try:
                payload = {"message": json.dumps(message)}
                self.REDIS.xadd(queue, payload)
                return True
            except Exception as e:
                logging.exception(
                    "RedisDB.queue_product " + str(queue) + " got exception: " + str(e)
                )
                self.__open__()
        return False

    def queue_consumer(self, queue_name, group_name, consumer_name, msg_id=b">") -> RedisMsg:
        """https://redis.io/docs/latest/commands/xreadgroup/"""
        for _ in range(3):
            try:

                try:
                    group_info = self.REDIS.xinfo_groups(queue_name)
                    if not any(gi["name"] == group_name for gi in group_info):
                        self.REDIS.xgroup_create(queue_name, group_name, id="0", mkstream=True)
                except redis.exceptions.ResponseError as e:
                    if "no such key" in str(e).lower():
                        self.REDIS.xgroup_create(queue_name, group_name, id="0", mkstream=True)
                    elif "busygroup" in str(e).lower():
                        logging.warning("Group already exists, continue.")
                        pass
                    else:
                        raise

                args = {
                    "groupname": group_name,
                    "consumername": consumer_name,
                    "count": 1,
                    "block": 5,
                    "streams": {queue_name: msg_id},
                }
                messages = self.REDIS.xreadgroup(**args)
                if not messages:
                    return None
                stream, element_list = messages[0]
                if not element_list:
                    return None
                msg_id, payload = element_list[0]
                res = RedisMsg(self.REDIS, queue_name, group_name, msg_id, payload)
                return res
            except Exception as e:
                if str(e) == 'no such key':
                    pass
                else:
                    logging.exception(
                        "RedisDB.queue_consumer "
                        + str(queue_name)
                        + " got exception: "
                        + str(e)
                    )
                    self.__open__()
        return None

    def get_unacked_iterator(self, queue_names: list[str], group_name, consumer_name):
        try:
            for queue_name in queue_names:
                try:
                    group_info = self.REDIS.xinfo_groups(queue_name)
                except Exception as e:
                    if str(e) == 'no such key':
                        # Stream doesn't exist yet — created on first task publish
                        logging.debug(f"RedisDB.get_unacked_iterator queue {queue_name} doesn't exist yet")
                    else:
                        logging.warning(f"RedisDB.get_unacked_iterator queue {queue_name} error: {e}")
                    continue
                if not any(gi["name"] == group_name for gi in group_info):
                    logging.debug(f"RedisDB.get_unacked_iterator queue {queue_name} group {group_name} doesn't exist yet")
                    continue
                current_min = 0
                while True:
                    payload = self.queue_consumer(queue_name, group_name, consumer_name, current_min)
                    if not payload:
                        break
                    current_min = payload.get_msg_id()
                    logging.info(f"RedisDB.get_unacked_iterator {queue_name} {consumer_name} {current_min}")
                    yield payload
        except Exception:
            logging.exception(
                "RedisDB.get_unacked_iterator got exception: "
            )
            self.__open__()

    def get_pending_msg(self, queue, group_name):
        try:
            messages = self.REDIS.xpending_range(queue, group_name, '-', '+', 10)
            return messages
        except Exception as e:
            if 'No such key' not in (str(e) or ''):
                logging.warning(
                    "RedisDB.get_pending_msg " + str(queue) + " got exception: " + str(e)
                )
        return []

    def requeue_msg(self, queue: str, group_name: str, msg_id: str):
        for _ in range(3):
            try:
                messages = self.REDIS.xrange(queue, msg_id, msg_id)
                if messages:
                    self.REDIS.xadd(queue, messages[0][1])
                    self.REDIS.xack(queue, group_name, msg_id)
            except Exception as e:
                logging.warning(
                    "RedisDB.get_pending_msg " + str(queue) + " got exception: " + str(e)
                )
                self.__open__()

    def queue_info(self, queue, group_name) -> dict | None:
        for _ in range(3):
            try:
                groups = self.REDIS.xinfo_groups(queue)
                for group in groups:
                    if group["name"] == group_name:
                        return group
            except Exception as e:
                if 'no such key' in str(e).lower():
                    # Stream doesn't exist yet — created on first task publish
                    logging.debug("RedisDB.queue_info %s doesn't exist yet", queue)
                    return None
                logging.warning(
                    "RedisDB.queue_info " + str(queue) + " got exception: " + str(e)
                )
                self.__open__()
        return None

    def delete_if_equal(self, key: str, expected_value: str) -> bool:
        """
        Do following atomically:
        Delete a key if its value is equals to the given one, do nothing otherwise.
        """
        return bool(self.lua_delete_if_equal(keys=[key], args=[expected_value], client=self.REDIS))

    def delete(self, key) -> bool:
        try:
            self.REDIS.delete(key)
            return True
        except Exception as e:
            logging.warning("RedisDB.delete " + str(key) + " got exception: " + str(e))
            self.__open__()
        return False


REDIS_CONN = RedisDB()


class RedisDistributedLock:
    """Redis-backed distributed lock using the Redlock algorithm.

    Provides mutual exclusion across multiple processes/workers by
    leveraging Redis's atomic SET NX and Lua-based conditional delete.
    Supports both synchronous and async (spin-wait) acquisition.

    Attributes:
        lock_key: Redis key name for the lock.
        lock_value: Unique token identifying this lock holder.
        timeout: Lock expiration time in seconds.
        lock: Underlying valkey Lock instance.
    """

    def __init__(self, lock_key, lock_value=None, timeout=10, blocking_timeout=1):
        self.lock_key = lock_key
        if lock_value:
            self.lock_value = lock_value
        else:
            self.lock_value = str(uuid.uuid4())
        self.timeout = timeout
        self.lock = Lock(REDIS_CONN.REDIS, lock_key, timeout=timeout, blocking_timeout=blocking_timeout)

    def acquire(self):
        """Attempt to acquire the lock (non-blocking, single attempt).

        Returns:
            True if the lock was acquired, False otherwise.
        """
        REDIS_CONN.delete_if_equal(self.lock_key, self.lock_value)
        return self.lock.acquire(token=self.lock_value)

    async def spin_acquire(self):
        """Acquire the lock with async spin-wait, retrying every 10 seconds."""
        REDIS_CONN.delete_if_equal(self.lock_key, self.lock_value)
        while True:
            if self.lock.acquire(token=self.lock_value):
                break
            await asyncio.sleep(10)

    def release(self):
        """Release the lock by deleting the key if it holds our token."""
        REDIS_CONN.delete_if_equal(self.lock_key, self.lock_value)
