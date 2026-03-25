# RAG Evaluation System Architecture

## Evaluation Pipeline

```
┌──────────────────────────────────────────────────────┐
│           Test Dataset (CSV)                         │
│  [ID | Question | Expected Answer | Source Docs]    │
└────────────────────┬─────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────┐
│         1. Retrieval Module                          │
│  - Load documents                                   │
│  - Chunk & embed documents                         │
│  - Store in vector DB                              │
└────────────────────┬─────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────┐
│         2. Query Processing                          │
│  - Encode test question                            │
│  - Retrieve top-K documents                        │
│  - Rank by relevance score                         │
└────────────────────┬─────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────┐
│         3. Generation Module                         │
│  - Build context from retrieved docs               │
│  - Pass to LLM with prompt template                │
│  - Generate answer                                 │
└────────────────────┬─────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────┐
│         4. Evaluation Metrics                        │
│  - Retrieval: Precision@K, Recall@K, MRR          │
│  - Generation: BLEU, ROUGE, Semantic Similarity   │
│  - Hybrid: Combined scoring                        │
└────────────────────┬─────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────┐
│         5. Results & Analysis                        │
│  - Per-test-case scores                            │
│  - Aggregate metrics                               │
│  - Failure analysis                                │
└──────────────────────────────────────────────────────┘
```

## Component Responsibilities

### Retrieval Module
- Loads and chunks source documents
- Creates vector embeddings
- Stores in vector database
- Retrieves relevant docs for each query

### Query Processor
- Encodes test questions
- Queries vector DB with similarity threshold
- Returns ranked results

### Generation Module
- Builds context string from retrieved docs
- Calls LLM with system prompt + context + question
- Returns generated answer

### Metrics Engine
- Compares generated vs expected answers
- Calculates retrieval accuracy metrics
- Calculates generation quality metrics
- Aggregates results per question and overall

## Data Flow

**Input**: CSV file with test questions and expected answers
**Process**: For each test case:
1. Retrieve documents matching the question
2. Generate answer using retrieved context
3. Compare with expected answer
4. Calculate metrics

**Output**: Aggregate report with:
- Per-metric scores
- Per-category performance
- Failure analysis
- Recommendations


## Component Details

### 1. Chat Service
- Handles user queries
- Performs semantic search
- Retrieves context from vector DB
- Calls LLM for answer generation
- Streaming response support

### 2. Document Indexer
- Processes uploaded documents
- Splits into chunks
- Generates embeddings
- Stores in vector database
- Maintains metadata

### 3. Search Engine
- Hybrid search (vector + keyword)
- BM25 for keyword search
- ANN for vector search
- Result re-ranking
- Deduplication

### 4. LLM Interface
- Provider abstraction layer
- Supports: OpenAI, Anthropic, Cohere, Ollama
- Prompt engineering
- Token counting
- Error handling

### 5. Vector Database
Options:
- **Milvus** (Open source, scalable)
- **Weaviate** (Cloud-native)
- **Pinecone** (Managed service)
- **Qdrant** (High performance)

### 6. SQL Database
- User management
- Project metadata
- Chat history
- API keys
- Audit logs

## Data Flow

### Indexing Flow
```
Upload Doc → Parse → Chunk → Embed → Vector DB
         ↓
       Metadata → SQL DB
         ↓
       Index Summary → Cache
```

### Query Flow
```
User Query → Embed → Search Vector DB → Retrieve Top K
                          ↓
                   Search SQL DB (metadata)
                          ↓
                   Re-rank Results
                          ↓
                   Build Context → LLM
                          ↓
                   Generate Answer → Stream to UI
```

## Scaling Considerations

### Horizontal Scaling
- Stateless chat service (easy to scale)
- Load balancer for multiple instances
- Shared database backend

### Vertical Scaling
- Increase document chunk size for throughput
- Use GPU acceleration for embeddings
- Increase worker threads

### Caching Strategy
- Cache embeddings computation
- Cache frequently asked questions
- TTL-based cache invalidation
- Cache warming for popular documents

## Performance Metrics

- **Query Latency**: <500ms (p95)
- **Throughput**: 1000 QPS per instance
- **Embedding Speed**: 10K documents/hour
- **Vector Search**: <50ms for top 10 results
- **Memory Usage**: ~2GB base + 1GB per 10K documents
