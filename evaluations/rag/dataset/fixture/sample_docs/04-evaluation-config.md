# RAG Evaluation Configuration

## Test Dataset Configuration

### Dataset Format
```json
{
  "test_cases": [
    {
      "id": "test_001",
      "question": "What is RAG evaluation?",
      "expected_answer": "RAG evaluation measures system quality...",
      "source_docs": ["doc1.md", "doc2.md"],
      "category": "factual",
      "difficulty": "easy"
    }
  ]
}
```

### Required Fields
- **id**: Unique test case identifier
- **question**: The input question
- **expected_answer**: Golden answer for comparison
- **source_docs**: Relevant documents that should be retrieved
- **category**: Question type (factual, procedural, comparative)
- **difficulty**: Difficulty level (easy, medium, hard)

## Evaluation Configuration

### Metric Settings
```yaml
metrics:
  retrieval:
    precision_k: [1, 5, 10]
    recall_k: [5, 10]
    mrr_k: 10

  generation:
    bleu:
      max_gram: 4
    rouge:
      types: [rouge1, rougeL]
    semantic_similarity:
      threshold: 0.7

  hybrid:
    combined_scoring: true
    weights:
      retrieval: 0.4
      generation: 0.6
```

## System Configuration

### LLM Settings
```yaml
llm:
  provider: openai          # openai, anthropic, cohere, ollama
  model: gpt-4
  temperature: 0.7         # 0=deterministic, 1=creative
  max_tokens: 2000
  timeout: 30              # seconds
```

### Retrieval Settings
```yaml
retrieval:
  top_k: 10                # How many docs to retrieve
  similarity_threshold: 0.5
  reranking: true
  rerank_top_k: 50
```

### Document Processing
```yaml
documents:
  chunk_size: 512          # Characters per chunk
  chunk_overlap: 50        # Overlap between chunks
  embedding_model: text-embedding-3-large
```
