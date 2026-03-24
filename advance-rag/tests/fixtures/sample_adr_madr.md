# ADR-001: Use PostgreSQL for Primary Storage

## Status

Accepted

## Context and Problem Statement

Our application needs a reliable and scalable primary database. We are
building a multi-tenant SaaS platform that requires strong ACID compliance,
complex querying capabilities, and mature tooling support.

The current prototype uses SQLite for development, but this will not scale
for production workloads with concurrent writes from multiple services.
We need to select a production-grade RDBMS.

## Decision Outcome

Chosen option: PostgreSQL, because it provides excellent ACID compliance,
native JSONB support for semi-structured data, strong extension ecosystem
(PostGIS, pg_trgm, pgvector), and battle-tested replication.

PostgreSQL also supports row-level security which aligns with our
multi-tenant architecture requirements.

## Consequences

Good:
- Mature ecosystem with excellent tooling (pg_dump, pgAdmin, etc.)
- Native JSONB support eliminates need for separate document store
- Strong community and long-term support guarantees
- Built-in full-text search capabilities

Bad:
- Slightly more complex setup compared to MySQL
- Connection pooling (PgBouncer) needed for high-concurrency workloads

## Pros and Cons of the Options

### Option 1: PostgreSQL
- Good, because ACID compliant with excellent JSON support
- Good, because mature extension ecosystem
- Bad, because slightly steeper learning curve

### Option 2: MySQL 8
- Good, because widely deployed and familiar
- Bad, because weaker JSON querying capabilities
- Bad, because less flexible extension model
