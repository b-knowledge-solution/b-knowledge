# RAG Evaluation Metrics

## Overview

Metrics are quantitative measures used to evaluate RAG system performance against golden answers.

## Retrieval Metrics

### Precision@K
Of the top K retrieved documents, what fraction are relevant?
```
Precision@10 = (relevant docs in top 10) / 10
```
Range: 0 to 1 (higher is better)

### Recall@K
Of all relevant documents in the corpus, what fraction appear in top K?
```
Recall@10 = (relevant docs in top 10) / (total relevant docs)
```
Range: 0 to 1 (higher is better)

### Mean Reciprocal Rank (MRR)
Average rank position of the first relevant document.
```
MRR = 1 / (average rank of first relevant doc)
```
Range: 0 to 1 (higher is better)

## Generation Metrics

### BLEU Score
Measures n-gram overlap between generated and reference answers
```
BLEU = (count of matching n-grams) / (total n-grams)
```
Range: 0 to 1 (higher is better)

### ROUGE Score
Measures recall of n-grams in reference answer
```
ROUGE = (matching n-grams) / (n-grams in reference)
```
Range: 0 to 1 (higher is better)

## Semantic Metrics

### Semantic Similarity
Cosine similarity between embeddings of generated vs reference answer
```
Similarity = (embedding_generated · embedding_reference) / (||embedding_generated|| * ||embedding_reference||)
```
Range: -1 to 1 (higher is better)

### Token Overlap
Fraction of tokens from reference that appear in generated answer
```
Token_Overlap = (shared tokens) / (tokens in reference)
```
Range: 0 to 1 (higher is better)

## Interpretation Guide

| Metric | Excellent | Good | Fair | Poor |
|--------|-----------|------|------|------|
| Precision@10 | >0.8 | 0.6-0.8 | 0.4-0.6 | <0.4 |
| Recall@10 | >0.8 | 0.6-0.8 | 0.4-0.6 | <0.4 |
| BLEU | >0.5 | 0.3-0.5 | 0.1-0.3 | <0.1 |
| Semantic Similarity | >0.8 | 0.6-0.8 | 0.4-0.6 | <0.4 |
