# RAG Evaluation System

A comprehensive automated evaluation system for RAG (Retrieval-Augmented Generation) applications built with Docker, Python, and Promptfoo.

## Quick Start (5 minutes)

### 1. Deploy the System
```bash
cd evaluations/rag

# On Windows (PowerShell)
.\deploy.ps1

# On Linux/Mac/Git Bash
./deploy.sh

# Or with Makefile
make deploy
```

### 2. Verify Everything Works
```bash
# After deployment, verify all components
.\verify.ps1        # Windows
./verify.sh         # Linux/Mac

# Or with Makefile
make verify
```

### 3. Check System Status Anytime
```bash
# See what's working and what needs implementation
make verify

# Get detailed information
./verify.sh --detailed
```

## Documentation

- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Complete deployment & troubleshooting guide
- **[../tasks/rag-evaluation-tasks.md](../tasks/rag-evaluation-tasks.md)** - Detailed task breakdown (all 4 phases)
- **[../../docs/rag-evaluation.pu](../../docs/rag-evaluation.pu)** - Architecture diagram

## What's Included

### Automated Deployment Scripts
- **`deploy.sh`** (Bash) - Deploy with 5 phases of verification
- **`deploy.ps1`** (PowerShell) - Deploy on Windows
- **`verify.sh`** (Bash) - Check 8 phases of system status
- **`verify.ps1`** (PowerShell) - Health check on Windows

### Docker Setup
- **`Dockerfile`** - Multi-stage build (Node + Python)
- **`docker-compose.yml`** - Service configuration & volumes

### Utilities
- **`Makefile`** - Convenient shortcuts for all tasks
- **`.env.example`** - Environment configuration template

## Workflow

### Phase 1: Setup (Complete with deploy.sh/ps1) ✓
```
└─ Docker environment ready
   ✓ Docker image built
   ✓ Containers available
   ✓ Volumes configured
```

### Phase 2: Dataset Preparation (Next)
```
└─ Prepare evaluation dataset (14-20 hours)
   • Use Easy Dataset UI to generate Q&A pairs
   • Export to: dataset/eval_dataset.yaml
```

### Phase 3: Implementation
```
└─ Implement evaluation code (20-22 hours)
   • providers/rag_provider.py - B-Knowledge integration
   • metrics/*.py - Evaluation metrics (4 metrics)
   • promptfooconfig.yaml - Test configuration
```

### Phase 4: Testing & Reports
```
└─ Run evaluation (8-12 hours)
   • make eval - Run all tests
   • make report - Generate HTML reports
   • Analyze results & iterate
```

## Common Commands

| Task | Bash | PowerShell | Makefile |
|------|------|-----------|----------|
| Deploy | `./deploy.sh` | `.\deploy.ps1` | `make deploy` |
| Verify | `./verify.sh` | `.\verify.ps1` | `make verify` |
| Shell | `docker compose run --rm -it rag-eval bash` | — | `make shell` |
| Build | `docker compose build rag-eval` | — | `make build` |
| Logs | `docker compose logs -f rag-eval` | — | `make logs` |
| Run Eval | `docker compose run --rm rag-eval make eval` | — | `make eval` |

## Verification (Quick & Simple)

The `verify` script shows:

```
step 1/5: Docker installed => done
step 2/5: Docker daemon running => done
step 3/5: Docker Compose available => done
...
evaluation setting up completed. (5/5)
```

Exit codes:
- `=> done` - Check passed ✓
- `=> failed` - Check failed ✗

## System Architecture

```
evaluations/rag/
├── Docker Environment (Node 22 + Python 3.11)
│   ├── Promptfoo (orchestrator)
│   └── Python Metrics (evaluation)
├── B-Knowledge REST API (via HTTP)
│   ├── Chat endpoint (SSE native)
│   └── Search endpoint
└── Outputs (results/)
    ├── Evaluation scores
    ├── HTML report
    └── Raw metrics
```

## Environment Setup

Create `.env` from `.env.example` with:

```bash
# B-Knowledge Backend
BKNOWLEDGE_API_URL=http://host.docker.internal:3001
BKNOWLEDGE_CHAT_TOKEN=<from-settings>
BKNOWLEDGE_SEARCH_TOKEN=<from-settings>

# LLM Judge (for metrics evaluation)
LLM_JUDGE_API_KEY=sk-...

# Langfuse (optional observability)
LANGFUSE_HOST=https://cloud.langfuse.com
LANGFUSE_PUBLIC_KEY=pk-...
LANGFUSE_SECRET_KEY=sk-...
```

See **DEPLOYMENT.md** for instructions on obtaining each value.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Docker not running | Start Docker Desktop or `systemctl start docker` |
| .env not found | `cp .env.example .env` and populate values |
| Volume mount failed | Check Docker Desktop file sharing settings |
| API connectivity error | Verify B-Knowledge is running on port 3001 |
| Verification fails | Run `./verify.sh --detailed` for detailed diagnostics |

See **DEPLOYMENT.md** Troubleshooting section for more cases.

## Next Steps

1. ✓ **Deployment** - Run `make deploy` (5-10 minutes)
2. ✓ **Verification** - Run `make verify` (2 minutes)
3. → **Dataset Setup** - Prepare evaluation data (14-20 hours)
4. → **Code Implementation** - Build providers & metrics (20-22 hours)
5. → **Run Evaluation** - Execute tests (8-12 hours)

## Project Structure

```
evaluations/
├── rag/                          ← You are here
│   ├── deploy.sh
│   ├── deploy.ps1
│   ├── verify.sh
│   ├── verify.ps1
│   ├── Makefile
│   ├── DEPLOYMENT.md
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── .env.example
│   ├── dataset/                  ← Your Q&A evaluation data
│   ├── providers/                ← RAG provider implementations
│   ├── metrics/                  ← Evaluation metrics
│   ├── results/                  ← Generated evaluation reports
│   └── README.md                 ← This file
└── tasks/
    └── rag-evaluation-tasks.md   ← Detailed task breakdown
```

---

**For comprehensive documentation, see [DEPLOYMENT.md](DEPLOYMENT.md)**
