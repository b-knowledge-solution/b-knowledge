# RAG Evaluation Framework

## Overview

The RAG (Retrieval-Augmented Generation) evaluation framework is designed to measure the quality and effectiveness of RAG systems.

## Evaluation Methodology

RAG evaluation consists of three main components:

### 1. Retrieval Quality
Measures how well the system retrieves relevant documents:
- Precision: Of retrieved docs, are they relevant?
- Recall: Of all relevant docs, were they retrieved?
- Mean Reciprocal Rank (MRR): How high is the first relevant doc?

### 2. Generation Quality
Measures how well the system generates answers:
- Relevance: Does the answer address the question?
- Faithfulness: Is the answer grounded in retrieved documents?
- Completeness: Does the answer cover all necessary points?

### 3. End-to-End Quality
Measures overall RAG system performance:
- Accuracy: Is the final answer correct?
- BLEU score: Text similarity with golden answers
- ROUGE score: Content coverage of golden answers

## Test Dataset Requirements

A good evaluation dataset should include:
- Diverse question types (factual, procedural, comparative)
- Various difficulty levels (easy, medium, hard)
- Multiple correct answer variations
- Edge cases and corner cases
- Clear source document references

## Evaluation Workflow

1. Prepare test dataset with QA pairs
2. Run RAG system against each question
3. Collect retrieved documents and generated answer
4. Compute metrics against expected answers
5. Analyze results and identify failure modes

**Out of Memory?**
Increase Docker memory to at least 2GB:
```bash
docker run -m 2g -p 8080:3000 bknowledge:latest
```

**Slow indexing?**
Use GPU acceleration:
```bash
docker run --gpus all -p 8080:3000 bknowledge:latest
```
