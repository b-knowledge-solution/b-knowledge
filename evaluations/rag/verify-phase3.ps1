#Requires -Version 5.1

<#
.SYNOPSIS
    Phase 3 — Code Implementation Verification

.DESCRIPTION
    Verifies all Phase 3 code is in place and runs the eval pipeline end-to-end
    using mock data (no live API required).

    Output format:
      step 1/5 [ 20%]: clean previous artifacts    => done
      step 2/5 [ 40%]: source files exist          => done
      step 3/5 [ 60%]: docker image available      => done
      step 4/5 [ 80%]: python imports valid        => done
      step 5/5 [100%]: smoke eval (mock, 20 pairs) => done

      phase 3 verify completed. [5/5]

    IDEMPOTENT: Step 1 always removes results/, __pycache__, and .promptfoo
    cache so a previously failed run never pollutes the next one.

    Re-run at any time:
      .\verify-phase3.ps1

    Clean only (skip verify):
      .\verify-phase3.ps1 -Clean
#>

param(
    [switch]$Clean
)

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------

$Colors = @{ Red = 'Red'; Green = 'Green'; Yellow = 'Yellow'; Cyan = 'Cyan' }
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $SCRIPT_DIR

$TotalSteps = 5
$Script:Step = 0
$Script:Failed = 0

# ---------------------------------------------------------------------------
# Helper: run one labelled step with progress display
# ---------------------------------------------------------------------------

function Invoke-Step {
    <#
    .DESCRIPTION
        Runs $Action scriptblock. Prints progress line, marks done or FAILED.

    @param Name    Short label shown in output
    @param Action  Script block to execute; throw to indicate failure
    #>
    param(
        [string]$Name,
        [scriptblock]$Action
    )

    $Script:Step++
    # Compute percentage of total steps
    $pct = [int](($Script:Step / $TotalSteps) * 100)
    # Right-align percentage in 3 chars; left-align name in 40 chars
    $label = "step {0}/{1} [{2,3}%]: {3,-40}" -f $Script:Step, $TotalSteps, $pct, $Name
    Write-Host -NoNewline $label

    try {
        $result = & $Action
        # Treat explicit $false return as failure
        if ($result -eq $false) { throw "step returned false" }
        Write-Host "=> done" -ForegroundColor $Colors.Green
    } catch {
        Write-Host "=> FAILED" -ForegroundColor $Colors.Red
        # Indent error detail under the step line
        Write-Host ("           " + $_.Exception.Message) -ForegroundColor $Colors.Red
        $Script:Failed++
    }
}

# ---------------------------------------------------------------------------
# Header
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "Phase 3 - Code Implementation Verify" -ForegroundColor $Colors.Cyan
Write-Host ("─" * 57)
Write-Host ""

# ===========================================================================
# STEP 1: Clean previous run artifacts
#
# Removes results/, __pycache__ folders, and .promptfoo cache.
# This makes every re-run start from a clean slate.
# ===========================================================================

Invoke-Step "clean previous artifacts" {
    # Files/folders to remove before each run
    $targets = @(
        "results\eval_output.json",
        "results\report.html",
        "__pycache__",
        "providers\__pycache__",
        "metrics\__pycache__",
        "scripts\__pycache__",
        ".promptfoo"
    )

    foreach ($t in $targets) {
        if (Test-Path $t) {
            Remove-Item -Recurse -Force $t
        }
    }

    # Re-create empty results/ so Docker volume mount works
    New-Item -ItemType Directory -Force -Path "results" | Out-Null
}

# Early exit if -Clean flag was passed
if ($Clean) {
    Write-Host ""
    Write-Host "Clean-only mode. Previous artifacts removed." -ForegroundColor $Colors.Green
    exit 0
}

# ===========================================================================
# STEP 2: Required source files exist
#
# Every file that the eval pipeline needs must be present. Missing any one
# of these means Phase 3 implementation is incomplete.
# ===========================================================================

Invoke-Step "source files exist" {
    $required = @(
        "promptfooconfig.yaml",
        "providers\rag_provider.py",
        "providers\base.py",
        "metrics\accuracy.py",
        "metrics\precision.py",
        "metrics\recall.py",
        "metrics\f1.py",
        "metrics\__init__.py",
        "dataset\eval_dataset_test.yaml"
    )

    $missing = $required | Where-Object { -not (Test-Path $_) }
    if ($missing.Count -gt 0) {
        throw "missing files: $($missing -join ', ')"
    }
}

# ===========================================================================
# STEP 3: Docker image available
#
# The eval pipeline runs inside rag-eval:latest. If the image is not built,
# run: make build
# ===========================================================================

Invoke-Step "docker image available" {
    $img = docker images rag-eval:latest --quiet 2>$null
    if (-not $img) {
        throw "rag-eval:latest not found — run: make build"
    }
}

# ===========================================================================
# STEP 4: Python imports valid (inside container)
#
# Verifies that metrics and providers modules load without error inside the
# Docker container, confirming Python syntax and import paths are correct.
# ===========================================================================

Invoke-Step "python imports valid (in container)" {
    $pycheck = "from metrics import score_all; from providers.rag_provider import RagProviderFactory; print('ok')"
    $out = docker compose run --rm rag-eval python -c $pycheck 2>&1
    if ($LASTEXITCODE -ne 0) {
        # Show last 3 lines of error output
        $detail = ($out | Select-Object -Last 3) -join " | "
        throw "import error: $detail"
    }
}

# ===========================================================================
# STEP 5: Smoke eval — mock mode, 20-pair fixture
#
# Runs a full eval cycle inside Docker with:
#   - MockRagProvider (no live API needed)
#   - 20-pair fixture dataset
#
# Success = promptfoo exits 0 AND results/eval_output.json is created.
# ===========================================================================

Invoke-Step "smoke eval (mock, 20 pairs)" {
    $out = docker compose run --rm `
        -e "RAG_MOCK_MODE=true" `
        -e "PROMPTFOO_DATASET_PATH=dataset/eval_dataset_test.yaml" `
        rag-eval `
        promptfoo eval -c promptfooconfig.yaml 2>&1

    if ($LASTEXITCODE -ne 0) {
        $detail = ($out | Select-Object -Last 5) -join " | "
        throw "promptfoo eval failed (exit $LASTEXITCODE): $detail"
    }

    # Confirm output file was produced
    if (-not (Test-Path "results\eval_output.json")) {
        throw "results/eval_output.json was not created"
    }
}

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host ("─" * 57)
$Passed = $TotalSteps - $Script:Failed

if ($Script:Failed -eq 0) {
    Write-Host "phase 3 verify completed. [$Passed/$TotalSteps]" -ForegroundColor $Colors.Green
    Write-Host ""
    Write-Host "  results/eval_output.json  ready"
    Write-Host "  view report : docker compose run --rm rag-eval promptfoo view"
    Write-Host "  next phase  : run with real dataset when Phase 2 QA is done"
    exit 0
} else {
    Write-Host "$($Script:Failed) step(s) failed. [$Passed/$TotalSteps passed]" -ForegroundColor $Colors.Red
    Write-Host "Fix the issues above and re-run: .\verify-phase3.ps1"
    exit 1
}
