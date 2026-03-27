#Requires -Version 5.1

<#
.SYNOPSIS
    RAG Evaluation System — One-time Setup

.DESCRIPTION
    Run this script ONCE to prepare the evaluation environment.
    After setup is complete, use run-eval.ps1 for every evaluation run.

    What this script does:
      [1/4]  Checks prerequisites  (Docker Desktop, docker-compose.yml)
      [2/4]  Prepares configuration (.env from template, opens editor if needed)
      [3/4]  Builds Docker image   (rag-evaluator, ~2-5 minutes first time)
      [4/4]  Starts Easy Dataset   (http://localhost:1717 — Q&A editor for QA team)

.EXAMPLE
    .\setup.ps1
#>

$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $SCRIPT_DIR

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

$ScanResults  = [System.Collections.ArrayList]::new()
$BlockerCount = 0

function Add-Result {
    param([string]$Label, [string]$Status, [string]$Problem = "", [string]$Fix = "")
    [void]$ScanResults.Add([PSCustomObject]@{
        Label   = $Label
        Status  = $Status
        Problem = $Problem
        Fix     = $Fix
    })
    if ($Status -eq "FAIL") { $script:BlockerCount++ }
}

function Write-ResultLine {
    param([string]$Label, [string]$Status)
    $padded = "  {0,-46}" -f $Label
    Write-Host -NoNewline $padded
    switch ($Status) {
        "PASS" { Write-Host "OK"      -ForegroundColor Green   }
        "FAIL" { Write-Host "FAILED"  -ForegroundColor Red     }
        "SKIP" { Write-Host "skipped" -ForegroundColor DarkGray }
        "INFO" { Write-Host "done"    -ForegroundColor Cyan    }
    }
}

# ---------------------------------------------------------------------------
# HEADER
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "  RAG Evaluation System - Setup" -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Run this script once to prepare the environment." -ForegroundColor Gray
Write-Host "  For daily evaluation runs, use: .\run-eval.ps1" -ForegroundColor Gray
Write-Host ""

# ===========================================================================
# [1/4]  Prerequisites
# ===========================================================================

Write-Host "[1/4]  Checking prerequisites..." -ForegroundColor Cyan
Write-Host ""

# Docker installed?
$dockerVer = docker --version 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-ResultLine "  Docker installed" "PASS"
} else {
    Add-Result "[1/4]  Docker installed" "FAIL" `
        "Docker Desktop is not installed." `
        "Download and install Docker Desktop from https://www.docker.com/products/docker-desktop`nThen run this script again."
}

# Docker daemon running?
$null = docker info 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-ResultLine "  Docker Desktop running" "PASS"
} else {
    Add-Result "[1/4]  Docker Desktop running" "FAIL" `
        "Docker Desktop is installed but not running." `
        "Open Docker Desktop from the Start menu and wait until the tray icon shows 'Engine running'."
}

# docker-compose.yml present?
if (Test-Path "docker-compose.yml") {
    Write-ResultLine "  docker-compose.yml found" "PASS"
} else {
    Add-Result "[1/4]  docker-compose.yml" "FAIL" `
        "docker-compose.yml not found. Wrong directory?" `
        "Navigate to evaluations\rag and run: .\setup.ps1"
}

Write-Host ""

# ===========================================================================
# [2/4]  Configuration (.env)
# ===========================================================================

Write-Host "[2/4]  Preparing configuration (.env)..." -ForegroundColor Cyan
Write-Host ""

$EnvCreated = $false

if (-not (Test-Path ".env")) {
    # Create from template
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
        Write-ResultLine "  Created .env from template" "INFO"
        $EnvCreated = $true
    } else {
        Add-Result "[2/4]  .env file" "FAIL" `
            ".env.example template not found." `
            "Ask a developer to restore the .env.example file in evaluations\rag."
    }
} else {
    Write-ResultLine "  .env already exists" "INFO"
}

# Check required fields
if (Test-Path ".env") {
    $envRaw = Get-Content ".env" -Raw -ErrorAction SilentlyContinue

    function Get-EnvVal([string]$key) {
        if ($envRaw -match "(?m)^$key=(.+)$") { $Matches[1].Trim() } else { "" }
    }

    $missingVars = @("BKNOWLEDGE_API_URL","BKNOWLEDGE_CHAT_TOKEN","LLM_JUDGE_API_KEY") |
        Where-Object { [string]::IsNullOrWhiteSpace((Get-EnvVal $_)) }

    if ($missingVars.Count -gt 0 -or $EnvCreated) {
        Write-Host ""
        Write-Host "  .env needs to be filled in before evaluation can run." -ForegroundColor Yellow
        Write-Host ""

        if ($missingVars.Count -gt 0) {
            Write-Host "  Missing values:" -ForegroundColor Yellow
            foreach ($v in $missingVars) { Write-Host "    $v" }
            Write-Host ""
        }

        Write-Host "  How to fill in each value:" -ForegroundColor Cyan
        Write-Host "    BKNOWLEDGE_API_URL   - URL of your B-Knowledge instance, e.g. http://localhost:3001"
        Write-Host "    BKNOWLEDGE_CHAT_TOKEN - B-Knowledge UI > Settings > Embed Tokens > Chat App"
        Write-Host "    LLM_JUDGE_API_KEY    - Your OpenAI or Anthropic API key"
        Write-Host ""
        Write-Host "  Opening .env for editing..." -ForegroundColor Yellow
        Start-Process notepad ".env" -Wait
        Write-Host ""

        # Re-check after edit
        $envRaw = Get-Content ".env" -Raw -ErrorAction SilentlyContinue
        $stillMissing = @("BKNOWLEDGE_API_URL","BKNOWLEDGE_CHAT_TOKEN","LLM_JUDGE_API_KEY") |
            Where-Object { [string]::IsNullOrWhiteSpace((Get-EnvVal $_)) }

        if ($stillMissing.Count -gt 0) {
            Add-Result "[2/4]  .env configuration" "FAIL" `
                "Required values still empty: $($stillMissing -join ', ')" `
                "Re-run .\setup.ps1 and fill in all required values when the editor opens."
        } else {
            Write-ResultLine "  .env values confirmed" "PASS"
        }
    } else {
        Write-ResultLine "  .env values OK" "PASS"
    }
}

Write-Host ""

# ===========================================================================
# [3/4]  Build Docker image (rag-evaluator)
# ===========================================================================

Write-Host "[3/4]  Building Docker image..." -ForegroundColor Cyan
Write-Host "       (this may take 2-5 minutes the first time)" -ForegroundColor Gray
Write-Host ""

$imageLines = (docker compose images rag-evaluator 2>&1 | Where-Object { $_ -match "\S" }) -as [array]
$alreadyBuilt = ($imageLines.Count -ge 2)

if ($alreadyBuilt) {
    Write-ResultLine "  Docker image already built" "PASS"
    Write-Host "       Re-build? Run: docker compose build rag-evaluator" -ForegroundColor Gray
} else {
    cmd /c "docker compose build rag-evaluator"
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-ResultLine "  Docker image built" "PASS"
    } else {
        Write-Host ""
        Add-Result "[3/4]  Docker image build" "FAIL" `
            "docker compose build failed." `
            "Check the output above for the error.`nCommon causes: no internet connection (cannot pull base image), insufficient disk space."
    }
}

Write-Host ""

# ===========================================================================
# [4/4]  Start Easy Dataset
# ===========================================================================

Write-Host "[4/4]  Starting Easy Dataset (Q&A editor for QA team)..." -ForegroundColor Cyan
Write-Host ""

# Check if it is already responding
function Get-HttpStatus {
    param([string]$Uri, [int]$TimeoutSec = 4)
    try {
        $r = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec $TimeoutSec -ErrorAction Stop
        return [int]$r.StatusCode
    }
    catch [System.Net.WebException] {
        if ($_.Exception.Response) { return [int]$_.Exception.Response.StatusCode }
        return 0
    }
    catch { return 0 }
}

$edStatus = Get-HttpStatus "http://localhost:1717"

if ($edStatus -eq 200) {
    Write-ResultLine "  Easy Dataset already running" "PASS"
    Write-Host "       Open: http://localhost:1717" -ForegroundColor Gray
} else {
    cmd /c "docker compose up -d easy-dataset"
    if ($LASTEXITCODE -eq 0) {
        # Wait up to 15 seconds for it to become healthy
        $ready = $false
        for ($i = 1; $i -le 5; $i++) {
            Start-Sleep -Seconds 3
            if ((Get-HttpStatus "http://localhost:1717") -eq 200) { $ready = $true; break }
        }
        if ($ready) {
            Write-ResultLine "  Easy Dataset started" "PASS"
            Write-Host "       Open: http://localhost:1717" -ForegroundColor Gray
        } else {
            Write-Host ""
            Write-Host "  Easy Dataset is starting up — it may take another minute." -ForegroundColor Yellow
            Write-Host "  Open: http://localhost:1717 once it is ready." -ForegroundColor Yellow
        }
    } else {
        Add-Result "[4/4]  Easy Dataset" "FAIL" `
            "docker compose up easy-dataset failed." `
            "Check Docker output above. Common cause: port 1717 already in use."
    }
}

Write-Host ""

# ===========================================================================
# [5/5]  Install Eval UI dependencies
# ===========================================================================

Write-Host "[5/5]  Installing Eval UI dependencies..." -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path "eval-ui\node_modules")) {
    Push-Location eval-ui
    npm install --silent
    if ($LASTEXITCODE -eq 0) {
        Pop-Location
        Write-ResultLine "  eval-ui npm install" "PASS"
    } else {
        Pop-Location
        Add-Result "[5/5]  Eval UI dependencies" "FAIL" `
            "npm install failed inside eval-ui/." `
            "Make sure Node.js 18+ is installed: node --version`nThen re-run this script."
    }
} else {
    Write-ResultLine "  eval-ui node_modules already present" "PASS"
}

Write-Host ""

# ===========================================================================
# Summary
# ===========================================================================

Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host ""

if ($BlockerCount -gt 0) {
    # Print all failures with instructions
    $plural = if ($BlockerCount -eq 1) { "issue" } else { "issues" }
    Write-Host "  Setup incomplete — $BlockerCount $plural to fix:" -ForegroundColor Red
    Write-Host ""
    foreach ($r in ($ScanResults | Where-Object { $_.Status -eq "FAIL" })) {
        Write-Host "  $($r.Label)" -ForegroundColor Red
        Write-Host "    Problem : $($r.Problem)"
        $first = $true
        $r.Fix -split "`n" | ForEach-Object {
            if ($first) { Write-Host "    Fix     : $_"; $first = $false }
            else         { Write-Host "              $_" }
        }
        Write-Host ""
    }
    Write-Host "  Fix the issues above and run .\setup.ps1 again." -ForegroundColor Red
    Write-Host ""
    exit 1
}

Write-Host "  Setup complete." -ForegroundColor Green
Write-Host ""
Write-Host "  Two web UIs are now ready:" -ForegroundColor Cyan
Write-Host ""
Write-Host "    http://localhost:1717   Easy Dataset  — QA: create & manage Q&A pairs"
Write-Host "    http://localhost:4000   Eval UI       — QA: run evaluation & view report"
Write-Host ""
Write-Host "  Start the Eval UI (run in a separate terminal, keep it open):" -ForegroundColor White
Write-Host "    cd eval-ui"
Write-Host "    node server.js"
Write-Host ""
Write-Host "  QA workflow (no terminal needed after UI is running):" -ForegroundColor White
Write-Host "    1. localhost:1717  — build dataset, export Alpaca JSON"
Write-Host "    2. Run once: python scripts\json_to_yaml.py dataset\export_alpaca.json dataset\eval_dataset.yaml"
Write-Host "    3. localhost:4000  — click Run Evaluation, watch live log, read report"
Write-Host ""
Write-Host "  Tech Lead: open http://localhost:4000 to view the latest report." -ForegroundColor Gray
Write-Host ""
