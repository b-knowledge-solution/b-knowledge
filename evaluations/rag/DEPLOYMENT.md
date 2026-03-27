# Deployment Guide - RAG Evaluation System

## Quick Start

### Option 1: PowerShell (Windows)
```powershell
cd evaluations\rag

# Deploy the system
.\deploy.ps1

# Verify everything is working
.\verify.ps1
```

### Option 2: Bash (Linux/Mac or Git Bash on Windows)
```bash
cd evaluations/rag

# Deploy the system
chmod +x deploy.sh verify.sh
./deploy.sh

# Verify everything is working
./verify.sh
```

### Option 3: Using Makefile
```bash
cd evaluations/rag
make deploy
make verify
```

---

## What the Deploy Script Does

### Phase 1: Prerequisites Check ✓
- Verifies Docker is installed and running
- Checks Docker Compose availability
- Validates Git installation
- Confirms Dockerfile and docker-compose.yml exist

### Phase 2: Environment Configuration ✓
- Creates `.env` from `.env.example` if missing
- Validates required environment variables
- Displays API endpoint configuration

### Phase 3: Docker Build ✓
- Builds multi-stage Docker image
- Outputs image size and details
- Prepares Node.js (promptfoo) + Python (metrics) environment

### Step 4: Container Validation ✓
- Tests container startup
- Verifies Python environment
- Checks Promptfoo installation
- Validates Python dependencies (httpx, dotenv, etc.)
- Tests volume mounts (dataset/ results/)
- (Optional) Validates API connectivity

### Phase 5: Configuration Check ✓
- Verifies dataset file exists
- Checks promptfoo config
- Lists implementation status

---

## Required Environment Variables

Create `.env` with these variables:

```bash
# B-Knowledge API
BKNOWLEDGE_API_URL=http://host.docker.internal:3001
BKNOWLEDGE_CHAT_TOKEN=<embed-token-from-UI>
BKNOWLEDGE_SEARCH_TOKEN=<embed-token-from-UI>

# LLM Judge (for metrics)
LLM_JUDGE_API_KEY=sk-...  # OpenAI or other LLM provider

# Langfuse (optional)
LANGFUSE_HOST=https://cloud.langfuse.com
LANGFUSE_PUBLIC_KEY=pk-...
LANGFUSE_SECRET_KEY=sk-...
```

### How to Get Embed Tokens:
1. Login to B-Knowledge UI
2. Go Settings → Embed Tokens
3. Click "Generate New Token" for Chat App + Search App
4. Copy tokens to `.env`

---

## Deploy Script Options

### PowerShell
```powershell
# Full deployment
.\deploy.ps1

# Check prerequisites only
.\deploy.ps1 -CheckOnly

# Skip container validation
.\deploy.ps1 -SkipValidation

# Show help
.\deploy.ps1 -Help
```

### Bash
```bash
# Full deployment
./deploy.sh

# Check prerequisites only
./deploy.sh --check-only

# Skip container validation
./deploy.sh --skip-validation

# Show help
./deploy.sh --help
```

## Verification & Health Checks

After deployment, use the `verify` script to check that all components are working correctly.

### Running Verification

#### PowerShell (Windows)
```powershell
# Full verification
.\verify.ps1
```

#### Bash (Linux/Mac/Git Bash)
```bash
# Full verification
./verify.sh
```

#### Using Makefile
```bash
make verify
```

### Sample Output

```
Checking Docker & Prerequisites...
step 1/5: Docker installed => done
step 2/5: Docker daemon running => done
step 3/5: Docker Compose available => done
step 4/5: Dockerfile exists => done
step 5/5: docker-compose.yml exists => done

Checking Environment Setup...
step 6/5: .env file exists => done
step 7/5: BKNOWLEDGE_API_URL set => done
step 8/5: LLM_JUDGE_API_KEY set => done

Checking Docker Setup...
step 9/5: Docker image built => done
step 10/5: Container starts => done
step 11/5: Python available => done
step 12/5: Promptfoo available => done

Checking Configuration Files...
step 13/5: Dataset folder exists => done
step 14/5: Providers folder exists => done
step 15/5: Metrics folder exists => done
step 16/5: Makefile exists => done

Finalizing...
step 17/5: running final checks => done

evaluation setting up completed. (17/5)
```

Or if there are issues:
```
...
step 10/5: Container starts => failed

evaluation setup has 1 issues. (17/5)

Common fixes:
  - .env missing?      Copy-Item .env.example .env (Windows) or cp .env.example .env (Linux)
  - Docker not running? Start Docker Desktop
  - Image not built?    docker compose build rag-eval
```

### Exit Codes

- **Exit 0** - All checks passed ✓
- **Exit 1** - One or more checks failed ✗

---

## Troubleshooting

### Docker daemon not running
- **Windows:** Start Docker Desktop application
- **Linux:** Run `sudo systemctl start docker`

### Port 3001 not accessible
- If B-Knowledge is running on host, use: `http://host.docker.internal:3001`
- If B-Knowledge is in Docker, use container name: `http://b-knowledge:3001`

### Volume mount issues
- Verify Docker Desktop has file sharing enabled (Settings → Resources → File Sharing)
- Try refreshing: `docker system prune -a`

### Missing .env file
- Script auto-creates from `.env.example`
- Edit and populate it with real API keys before proceeding

### Deployment fails at build stage
- Check Docker has enough disk space: `docker system df`
- Clear cache: `docker system prune`
- Try again: `./deploy.sh` or `.\deploy.ps1`

---

## After Successful Deployment

### 1. Prepare Dataset
```bash
# Step 1 — Create Q&A pairs in Easy Dataset UI
# Start Easy Dataset: docker compose up easy-dataset -d
# Open browser: http://localhost:1717
# 1. Upload reference documents from your Knowledge Base
# 2. Generate Q&A pairs automatically
# 3. Review and curate Q&A pairs (most important step)
# 4. Export → Alpaca format → save as: dataset/export_alpaca.json

# Step 2 — Convert JSON export to evaluation YAML
python scripts/json_to_yaml.py dataset/export_alpaca.json dataset/eval_dataset.yaml
```

### 2. Develop Evaluation Code
```bash
cd evaluations/rag

# Enter interactive shell
make shell

# Inside container:
# - Implement providers/rag_provider.py
# - Implement metrics/*.py files
# - Edit promptfooconfig.yaml
```

### 3. Run Evaluation
```bash
# Run pre-flight checks + full evaluation (no technical knowledge needed)
.\run-eval.ps1    # Windows
./run-eval.sh     # Linux / Mac

# Results written to:
#   results/eval_summary.md   — summary report, send to Tech Lead
#   results/eval_output.json  — raw data, for Developer / Tech Lead

# View interactive HTML report (Tech Lead / Developer):
docker compose run --rm rag-evaluator promptfoo view
# then open: http://localhost:15500
```

---

## Next Steps After Deployment

1. ✓ **Setup** - Run `setup.ps1` / `setup.sh` once
2. → **Dataset** - QA team creates Q&A pairs with Easy Dataset
3. → **Evaluation** - Operator runs `run-eval.ps1` / `run-eval.sh`
4. → **Review** - Tech Lead reads `results/eval_summary.md`

---

## Support & Debugging

### Check Docker status
```bash
docker compose ps

# View logs
docker compose logs -f rag-eval

# Interactive shell for debugging
make shell
# or
docker compose run --rm -it rag-eval bash
```

### Verify API connectivity inside container
```bash
# Inside container shell:
curl http://host.docker.internal:3001/api/v1/health

# Or with Python:
python -c "import httpx; r = httpx.get('http://host.docker.internal:3001'); print(r.status_code)"
```

### Clean rebuild
```bash
# Remove old image and rebuild
docker compose build --no-cache rag-eval

# Or use script
./deploy.sh
```

---

## File Structure

```
evaluations/rag/
├── deploy.sh              ← Bash deploy script
├── deploy.ps1             ← PowerShell deploy script
├── verify.sh              ← Bash verification script
├── verify.ps1             ← PowerShell verification script
├── DEPLOYMENT.md          ← This file
├── Dockerfile
├── docker-compose.yml
├── Makefile
├── .env                   ← Created by deploy script
├── .env.example
└── dataset/
    └── eval_dataset.yaml  ← Prepared in Phase 2
```

---

## Questions?

See `evaluations/tasks/rag-evaluation-tasks.md` for detailed task breakdown and phase descriptions.
