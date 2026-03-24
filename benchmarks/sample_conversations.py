"""Reusable test conversation data for mem0 vs native pipeline comparison.

Contains 10 multi-turn conversations covering diverse domains and edge cases:
technical preferences, project decisions, episodic events, procedural knowledge,
contradictory updates, multi-fact messages, ambiguous content, long discussions,
short confirmations, and mixed technical terms.

Each conversation is a list of {"role": str, "content": str} dicts matching
the format expected by mem0's Memory.add(messages=...).
"""

SAMPLE_CONVERSATIONS: list[list[dict[str, str]]] = [
    # 1. Technical preferences
    [
        {"role": "user", "content": "I mainly code in TypeScript these days. I prefer dark mode in all my editors."},
        {"role": "assistant", "content": "Got it! TypeScript with dark mode. What editor do you use?"},
        {"role": "user", "content": "VS Code is my go-to. I also use Neovim for quick edits on the server."},
        {"role": "assistant", "content": "Great combination. VS Code for main development and Neovim for remote work."},
    ],
    # 2. Project decisions
    [
        {"role": "user", "content": "We decided to use PostgreSQL instead of MongoDB for the new project."},
        {"role": "assistant", "content": "PostgreSQL is a solid choice. What drove that decision?"},
        {"role": "user", "content": "We need strong ACID transactions and our data is highly relational. Also the team has more Postgres experience."},
        {"role": "assistant", "content": "Makes sense. Relational data + team expertise + ACID requirements all point to PostgreSQL."},
        {"role": "user", "content": "We're also going with Knex as the query builder instead of Prisma, because we want more control over raw SQL when needed."},
    ],
    # 3. Episodic events
    [
        {"role": "user", "content": "Yesterday's deployment to production failed because the Redis connection pool was exhausted."},
        {"role": "assistant", "content": "That sounds painful. How did you resolve it?"},
        {"role": "user", "content": "We increased the pool size from 10 to 50 and added connection timeout handling. The fix was deployed at 3 AM."},
        {"role": "assistant", "content": "Glad it's resolved. You might want to add monitoring for connection pool usage."},
        {"role": "user", "content": "Yes, we set up Grafana alerts for when the pool exceeds 80% capacity."},
    ],
    # 4. Procedural knowledge
    [
        {"role": "user", "content": "To deploy our application, first run the test suite with npm test."},
        {"role": "assistant", "content": "What's the next step after tests pass?"},
        {"role": "user", "content": "Then build the Docker image with docker build -t app:latest . After that, push it to our private registry at registry.acme.com."},
        {"role": "assistant", "content": "And how do you deploy the pushed image?"},
        {"role": "user", "content": "Run kubectl apply -f k8s/production.yaml to update the Kubernetes deployment. Finally, verify the rollout with kubectl rollout status."},
    ],
    # 5. Contradictory updates (tests deduplication D-18)
    [
        {"role": "user", "content": "Our primary database is PostgreSQL."},
        {"role": "assistant", "content": "Noted. PostgreSQL as the primary database."},
        {"role": "user", "content": "Actually, we just finished migrating. Our primary database is now CockroachDB."},
        {"role": "assistant", "content": "Updated. CockroachDB is now your primary database. Was the migration smooth?"},
        {"role": "user", "content": "Mostly smooth. We had to rewrite some Postgres-specific queries, but CockroachDB's distributed nature is worth it."},
    ],
    # 6. Multi-fact messages
    [
        {"role": "user", "content": "I'm John, I work at Acme Corp, and I prefer Python over JavaScript. My team uses FastAPI for backend services and React for the frontend."},
        {"role": "assistant", "content": "Nice to meet you, John! Quite a diverse tech stack at Acme Corp."},
        {"role": "user", "content": "We also use Docker for containerization, Kubernetes for orchestration, and GitHub Actions for CI/CD. Our cloud provider is AWS."},
        {"role": "assistant", "content": "That's a comprehensive DevOps setup. AWS with K8s and GitHub Actions is a popular combination."},
    ],
    # 7. Ambiguous content (tests extraction quality on vague input)
    [
        {"role": "user", "content": "It was okay."},
        {"role": "assistant", "content": "Could you elaborate on what you mean?"},
        {"role": "user", "content": "I guess it works. Not sure if it's the best approach though."},
        {"role": "assistant", "content": "What aspects are you uncertain about?"},
        {"role": "user", "content": "Just the overall feel. Maybe we should revisit it later."},
    ],
    # 8. Long technical discussion (10+ sentences)
    [
        {"role": "user", "content": (
            "I've been evaluating different caching strategies for our API. "
            "Currently we use Redis for session storage and simple key-value caching. "
            "The problem is that our cache invalidation is manual and error-prone. "
            "We've considered using a write-through cache pattern where updates go to both the database and cache simultaneously. "
            "Another option is cache-aside where the application manages the cache explicitly. "
            "The write-through approach would give us stronger consistency guarantees. "
            "However, it adds latency to write operations since both stores must succeed. "
            "For read-heavy workloads like ours, cache-aside might be more efficient. "
            "We're processing about 10,000 API requests per minute during peak hours. "
            "The p99 latency requirement is under 200ms for all cached endpoints. "
            "Our current cache hit rate is around 85%, which we want to improve to at least 95%."
        )},
        {"role": "assistant", "content": "That's a thorough analysis. Given your read-heavy workload and p99 requirement, cache-aside with TTL-based invalidation might be optimal."},
        {"role": "user", "content": (
            "We're also looking at adding a CDN layer for static assets and API response caching. "
            "CloudFront is the leading candidate since we're already on AWS. "
            "The tricky part is cache key design for personalized API responses."
        )},
    ],
    # 9. Short confirmations
    [
        {"role": "user", "content": "Yes, let's do that."},
        {"role": "assistant", "content": "Confirmed. Proceeding with the plan."},
        {"role": "user", "content": "Sounds good."},
        {"role": "assistant", "content": "Great, I'll move forward."},
        {"role": "user", "content": "OK."},
    ],
    # 10. Mixed language hints (English with technical terms)
    [
        {"role": "user", "content": "We're implementing a RAG pipeline using LangChain and OpenSearch for our knowledge base."},
        {"role": "assistant", "content": "RAG with LangChain and OpenSearch is a solid architecture. What embedding model are you using?"},
        {"role": "user", "content": "text-embedding-3-small from OpenAI. We chunk documents with a 512 token window and 50 token overlap."},
        {"role": "assistant", "content": "Those are reasonable chunking parameters. How do you handle cross-chunk context?"},
        {"role": "user", "content": "We use parent-child retrieval. The child chunks are used for matching, but we return the parent chunk for context. The similarity threshold is 0.75 with top-k=5."},
    ],
]
