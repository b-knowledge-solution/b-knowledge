# RAG Evaluation Failure Analysis

## Common RAG Failure Modes

### 1. Retrieval Failures
**Problem:** System retrieves wrong documents

**Symptoms:**
- Retrieved documents don't match question topic
- Semantic search unable to find relevant content
- Keyword matching sensitive to exact terminology

**Debugging:**
1. Check if documents contain answer content
2. Verify document chunking (are chunks too small/large?)
3. Test similarity search independently
4. Review embedding quality

### 2. Generation Failures
**Problem:** System cannot generate answer from retrieved docs

**Symptoms:**
- Generated text is generic/irrelevant
- Answer doesn't cite source documents
- Inconsistent or contradictory answers

**Debugging:**
1. Check context window size (is context truncated?)
2. Review prompt template
3. Test LLM with same retrieved context
4. Check for hallucinations in generated text

### 3. Ranking Failures
**Problem:** Most relevant document not in top results

**Symptoms:**
- Correct document ranked 5th instead of 1st
- Different documents ranked high for similar questions
- Re-ranking strategy ineffective

**Debugging:**
1. Check embedding model quality
2. Verify similarity calculation
3. Test re-ranker effectiveness
4. Check document preprocessing

### 4. Answer Format Failures
**Problem:** System answers correctly but in wrong format

**Symptoms:**
- Answer is correct but incomplete
- Format doesn't match expected structure
- Multiple answers when one expected

**Debugging:**
1. Review output parsing
2. Check post-processing rules
3. Adjust prompt instructions
4. Validate against golden format

## Performance Analysis

**For low scores:**
1. Check if problem is retrieval or generation
2. Run isolated retrieval test: Do correct docs appear in top-10?
3. Run isolated generation test: Given correct docs, can LLM answer?
4. Identify systematic failure patterns

**For specific question types:**
- Factual questions: Check retrieval accuracy
- Procedural questions: Check answer structure
- Comparative questions: Check context handling
