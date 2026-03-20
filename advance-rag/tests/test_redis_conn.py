"""Unit tests for rag.utils.redis_conn module.

Tests the RedisDB connector including connection initialization, key-value
operations, sorted set operations, stream/queue operations, auto-increment
ID generation, Lua scripting, and the RedisMsg message wrapper.
The valkey/redis client is fully mocked.
"""
import os
import sys
import json
import pytest
from unittest.mock import MagicMock, patch

# Ensure advance-rag root is on the Python path
_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)

# Delete the pre-mocked module so we can import the real one
if "rag.utils.redis_conn" in sys.modules and not hasattr(sys.modules["rag.utils.redis_conn"], "RedisMsg"):
    del sys.modules["rag.utils.redis_conn"]


def _make_redis_db():
    """Create a RedisDB instance with a fully mocked Redis client.

    Bypasses the singleton pattern and __init__ constructor to avoid
    real connection attempts.

    Returns:
        RedisDB instance with mocked REDIS client.
    """
    from rag.utils.redis_conn import RedisDB

    db = RedisDB.__new__(RedisDB)
    db.REDIS = MagicMock()
    db.config = {"host": "localhost", "port": 6379, "db": 1}
    return db


class TestRedisMsg:
    """Tests for the RedisMsg stream message wrapper."""

    def test_get_message_returns_parsed_json(self):
        """Verify get_message returns the parsed JSON payload."""
        from rag.utils.redis_conn import RedisMsg

        mock_consumer = MagicMock()
        payload = {"task_id": "t1", "data": "test"}
        msg = RedisMsg(
            consumer=mock_consumer,
            queue_name="queue",
            group_name="group",
            msg_id="1234-0",
            message={"message": json.dumps(payload)},
        )

        assert msg.get_message() == payload

    def test_get_msg_id(self):
        """Verify get_msg_id returns the Redis stream message ID."""
        from rag.utils.redis_conn import RedisMsg

        mock_consumer = MagicMock()
        msg = RedisMsg(
            consumer=mock_consumer,
            queue_name="q",
            group_name="g",
            msg_id="5678-0",
            message={"message": json.dumps({"key": "val"})},
        )
        assert msg.get_msg_id() == "5678-0"

    def test_ack_calls_xack(self):
        """Verify ack() calls XACK on the consumer client."""
        from rag.utils.redis_conn import RedisMsg

        mock_consumer = MagicMock()
        msg = RedisMsg(
            consumer=mock_consumer,
            queue_name="myqueue",
            group_name="mygroup",
            msg_id="999-0",
            message={"message": json.dumps({})},
        )
        result = msg.ack()

        mock_consumer.xack.assert_called_once_with("myqueue", "mygroup", "999-0")
        assert result is True

    def test_ack_returns_false_on_error(self):
        """Verify ack() returns False when XACK raises."""
        from rag.utils.redis_conn import RedisMsg

        mock_consumer = MagicMock()
        mock_consumer.xack.side_effect = Exception("Redis error")
        msg = RedisMsg(
            consumer=mock_consumer,
            queue_name="q",
            group_name="g",
            msg_id="1-0",
            message={"message": json.dumps({})},
        )
        result = msg.ack()
        assert result is False


class TestRedisDBGetSet:
    """Tests for RedisDB get/set key-value operations."""

    def test_get_returns_value(self):
        """Verify get() returns the value from Redis."""
        db = _make_redis_db()
        db.REDIS.get.return_value = "stored_value"
        assert db.get("mykey") == "stored_value"

    def test_get_returns_none_when_not_connected(self):
        """Verify get() returns None when REDIS client is None."""
        db = _make_redis_db()
        db.REDIS = None
        assert db.get("mykey") is None

    def test_get_reconnects_on_error(self):
        """Verify get() attempts reconnection on exception."""
        db = _make_redis_db()
        db.REDIS.get.side_effect = Exception("Connection lost")
        db.__open__ = MagicMock()
        # Should not raise — handles error internally
        db.get("mykey")

    def test_set_stores_value(self):
        """Verify set() stores a value with expiration."""
        db = _make_redis_db()
        result = db.set("key1", "value1", 3600)
        db.REDIS.set.assert_called_once_with("key1", "value1", 3600)
        assert result is True

    def test_set_returns_false_on_error(self):
        """Verify set() returns False on exception."""
        db = _make_redis_db()
        db.REDIS.set.side_effect = Exception("Write error")
        db.__open__ = MagicMock()
        result = db.set("key1", "value1")
        assert result is False

    def test_set_obj_serializes_json(self):
        """Verify set_obj() serializes object as JSON."""
        db = _make_redis_db()
        obj = {"name": "test", "count": 42}
        result = db.set_obj("obj_key", obj, 7200)
        db.REDIS.set.assert_called_once()
        # Verify the stored value is valid JSON
        stored_json = db.REDIS.set.call_args[0][1]
        parsed = json.loads(stored_json)
        assert parsed["name"] == "test"
        assert result is True


class TestRedisDBExist:
    """Tests for RedisDB.exist() key existence check."""

    def test_returns_true_when_key_exists(self):
        """Verify exist() returns True for existing keys."""
        db = _make_redis_db()
        db.REDIS.exists.return_value = 1
        assert db.exist("existing_key") == 1

    def test_returns_none_when_not_connected(self):
        """Verify exist() returns None when REDIS is None."""
        db = _make_redis_db()
        db.REDIS = None
        assert db.exist("key") is None


class TestRedisDBSortedSets:
    """Tests for RedisDB sorted set operations."""

    def test_zadd_stores_member_with_score(self):
        """Verify zadd() stores a member with its score."""
        db = _make_redis_db()
        result = db.zadd("sorted_key", "member1", 1.5)
        db.REDIS.zadd.assert_called_once_with("sorted_key", {"member1": 1.5})
        assert result is True

    def test_zcount_returns_count(self):
        """Verify zcount() returns the count of members in score range."""
        db = _make_redis_db()
        db.REDIS.zcount.return_value = 5
        result = db.zcount("sorted_key", 0, 10)
        assert result == 5

    def test_zpopmin_returns_lowest_members(self):
        """Verify zpopmin() pops the lowest-scored members."""
        db = _make_redis_db()
        db.REDIS.zpopmin.return_value = [("member1", 1.0), ("member2", 2.0)]
        result = db.zpopmin("sorted_key", 2)
        assert len(result) == 2

    def test_zrangebyscore_returns_members(self):
        """Verify zrangebyscore() returns members in the score range."""
        db = _make_redis_db()
        db.REDIS.zrangebyscore.return_value = ["m1", "m2"]
        result = db.zrangebyscore("key", 0.0, 10.0)
        assert result == ["m1", "m2"]


class TestRedisDBSetOperations:
    """Tests for RedisDB set (SADD/SREM/SMEMBERS) operations."""

    def test_sadd_adds_member(self):
        """Verify sadd() adds a member to a set."""
        db = _make_redis_db()
        result = db.sadd("set_key", "member1")
        db.REDIS.sadd.assert_called_once_with("set_key", "member1")
        assert result is True

    def test_srem_removes_member(self):
        """Verify srem() removes a member from a set."""
        db = _make_redis_db()
        result = db.srem("set_key", "member1")
        db.REDIS.srem.assert_called_once_with("set_key", "member1")
        assert result is True

    def test_smembers_returns_members(self):
        """Verify smembers() returns all members of a set."""
        db = _make_redis_db()
        db.REDIS.smembers.return_value = {"m1", "m2", "m3"}
        result = db.smembers("set_key")
        assert "m1" in result
        assert len(result) == 3


class TestRedisDBAtomicOps:
    """Tests for RedisDB atomic increment/decrement operations."""

    def test_incrby(self):
        """Verify incrby() increments a key by given amount."""
        db = _make_redis_db()
        db.REDIS.incrby.return_value = 15
        result = db.incrby("counter", 5)
        db.REDIS.incrby.assert_called_once_with("counter", 5)
        assert result == 15

    def test_decrby(self):
        """Verify decrby() decrements a key by given amount."""
        db = _make_redis_db()
        db.REDIS.decrby.return_value = 3
        result = db.decrby("counter", 2)
        db.REDIS.decrby.assert_called_once_with("counter", 2)
        assert result == 3


class TestRedisDBHealth:
    """Tests for RedisDB.health() connectivity check."""

    def test_health_returns_true(self):
        """Verify health() returns True when Redis is reachable."""
        db = _make_redis_db()
        db.REDIS.get.return_value = "yy"
        result = db.health()
        assert result is True

    def test_health_checks_write_read(self):
        """Verify health() performs a set-then-get verification cycle."""
        db = _make_redis_db()
        db.REDIS.get.return_value = "yy"
        db.health()
        # Should have called set and get
        db.REDIS.set.assert_called_once()
        db.REDIS.get.assert_called_once()


class TestRedisDBIsAlive:
    """Tests for RedisDB.is_alive() connection check."""

    def test_alive_when_connected(self):
        """Verify is_alive() returns True when REDIS client exists."""
        db = _make_redis_db()
        assert db.is_alive() is True

    def test_not_alive_when_disconnected(self):
        """Verify is_alive() returns False when REDIS is None."""
        db = _make_redis_db()
        db.REDIS = None
        assert db.is_alive() is False


class TestRedisDBAutoIncrement:
    """Tests for RedisDB.generate_auto_increment_id() ID generation."""

    def test_generates_first_id(self):
        """Verify first call generates initial ID value."""
        db = _make_redis_db()
        # Simulate first-time increment (returns increment value)
        db.REDIS.incrby.return_value = 1
        db.REDIS.pipeline.return_value = MagicMock()
        result = db.generate_auto_increment_id()
        # When result == increment (1), it sets to 1+increment and returns that
        assert isinstance(result, int)

    def test_returns_minus_one_on_error(self):
        """Verify returns -1 when Redis operations fail."""
        db = _make_redis_db()
        db.REDIS.pipeline.side_effect = Exception("Redis down")
        db.__open__ = MagicMock()
        result = db.generate_auto_increment_id()
        assert result == -1


class TestRedisDBLuaScripts:
    """Tests for RedisDB Lua script constants."""

    def test_delete_if_equal_script_exists(self):
        """Verify the conditional delete Lua script is defined."""
        from rag.utils.redis_conn import RedisDB
        assert RedisDB.LUA_DELETE_IF_EQUAL_SCRIPT is not None
        assert "del" in RedisDB.LUA_DELETE_IF_EQUAL_SCRIPT

    def test_token_bucket_script_exists(self):
        """Verify the token bucket rate limiting Lua script is defined."""
        from rag.utils.redis_conn import RedisDB
        assert RedisDB.LUA_TOKEN_BUCKET_SCRIPT is not None
        assert "capacity" in RedisDB.LUA_TOKEN_BUCKET_SCRIPT
        assert "tokens" in RedisDB.LUA_TOKEN_BUCKET_SCRIPT
