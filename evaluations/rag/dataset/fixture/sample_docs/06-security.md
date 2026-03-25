# RAG Evaluation Best Practices

## Dataset Preparation

### Document Quality Checklist
- [ ] All documents have consistent formatting
- [ ] Unicode characters properly encoded (UTF-8)
- [ ] Sensitive information redacted (PII, credentials)
- [ ] Document chunks under 2000 tokens
- [ ] Clear document titles and metadata
- [ ] No duplicate documents in corpus

### Test Case Quality Checklist
- [ ] Questions are unambiguous and clear
- [ ] Expected answers are factually accurate
- [ ] Expected answers match document content
- [ ] Questions cover multiple difficulty levels
- [ ] Questions test different knowledge aspects
- [ ] At least 50 test cases for initial evaluation

## Evaluation Integrity

### Golden Answer Requirements
- Answers should exist in source documents
- Avoid subjective or opinion-based questions
- Use precise, factual phrasing
- Include specific metrics/values when applicable
- Provide alternative acceptable answers when relevant

### Avoiding Bias
- Balance question distribution across topics
- Include edge cases and boundary conditions
- Test with different phrasing of same question
- Include questions from different domains
- Consider domain-specific terminology

## Validation Best Practices

### Pre-Evaluation Checks
1. Verify CSV format is valid (comma-separated, proper quoting)
2. Check all required columns present
3. Validate no special characters in IDs
4. Confirm text encoding is UTF-8
5. Run csv_validator.py before proceeding

### Result Interpretation
- Don't rely on single metric alone
- Consider context (domain difficulty, model capability)
- Compare results against baseline metrics
- Investigate failure patterns systematically
- Document assumptions and limitations

## Common Pitfalls to Avoid

| Pitfall | Impact | Solution |
|---------|--------|----------|
| Vague questions | High failure rate | Use specific question phrasing |
| Incomplete golden answers | Unfair scoring | Include complete, detailed answers |
| Insufficient test data | Unreliable results | Use at least 100 test cases |
| No doc metadata | Can't analyze failures | Tag docs with category, domain |
| Metric threshold confusion | Wrong pass/fail criteria | Define thresholds before evaluation |

  ├─ Create projects
  ├─ Manage team members
  ├─ Share projects
  ├─ Delete projects

Editor
  ├─ Upload documents
  ├─ Query knowledge base
  ├─ Edit chat history

Viewer
  ├─ Query knowledge base
  ├─ View shared documents
  └─ Read-only access
```

## Security Best Practices

### 1. API Key Management
```bash
# Rotate API keys regularly
POST /api/v1/keys/rotate

# Use different keys for different environments
API_KEY_DEV=sk_test_xxx
API_KEY_PROD=sk_live_yyy
```

### 2. Document Handling
- Upload through HTTPS only
- Scan for malware (if available)
- Validate file types
- Sanitize text content

### 3. Rate Limiting
- Prevent brute force attacks
- Limit API requests per IP
- Implement exponential backoff

### 4. Audit Logging
All actions are logged:
- User logins
- Document uploads
- API calls
- Configuration changes
- Data access

View logs:
```bash
curl -H "Authorization: Bearer $API_KEY" \
  https://api.bknowledge.io/v1/audit/logs?limit=100
```

## Compliance

### Standards Supported
- GDPR (Data protection)
- HIPAA (Healthcare data)
- SOC2 Type II
- ISO 27001

### Data Retention
- Configurable retention periods
- Automatic deletion of old data
- GDPR right to deletion support

### Backup & Recovery
- Daily automated backups
- 30-day retention
- Point-in-time recovery available
- Disaster recovery plan documented

## Known Limitations

1. **Rate Limiting**: 100 requests/hour on free tier
2. **Document Size**: Maximum 100MB per document
3. **Concurrent Connections**: Max 100 per account
4. **API Key Expiry**: Keys expire after 1 year
5. **Encryption**: Enterprise feature only
