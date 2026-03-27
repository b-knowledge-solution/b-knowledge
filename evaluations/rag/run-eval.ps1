#Requires -Version 5.1

<#
.SYNOPSIS
    RAG Evaluation Runner

.DESCRIPTION
    Runs the B-Knowledge RAG evaluation in two steps:

      STEP 1  Pre-flight checks (config, connectivity, dataset, Docker)
      STEP 2  Run evaluation + generate report

    No technical knowledge is needed to run this script.
    If something is wrong, a plain-language explanation is shown.

.EXAMPLE
    .\run-eval.ps1
#>

$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $SCRIPT_DIR

# ---------------------------------------------------------------------------
# Load-DotEnv
# Reads .env key=value pairs into the current process environment so that
# connectivity checks can use the configured values.
#
# @description Load .env file into PowerShell process environment
# ---------------------------------------------------------------------------
function Load-DotEnv {
    if (-not (Test-Path ".env")) { return }
    Get-Content ".env" | ForEach-Object {
        $line = $_.Trim()
        # Skip blank lines and comments
        if ($line -eq "" -or $line.StartsWith("#")) { return }
        $idx = $line.IndexOf("=")
        if ($idx -lt 1) { return }
        $key   = $line.Substring(0, $idx).Trim()
        $value = $line.Substring($idx + 1).Trim()
        # Strip surrounding quotes
        $value = $value -replace '^"(.*)"$', '$1'
        $value = $value -replace "^'(.*)'$", '$1'
        [System.Environment]::SetEnvironmentVariable($key, $value, "Process")
    }
}

# ---------------------------------------------------------------------------
# $ScanResults / Add-ScanResult
# Collects the outcome of every pre-flight check so all issues can be shown
# at once after scanning — instead of stopping at the first failure.
#
# @param Label   Short check name shown in the scan table
# @param Status  PASS | FAIL | SKIP
# @param Problem One-line problem description (FAIL only)
# @param Fix     Multi-line fix instructions — use `n as line separator (FAIL only)
# ---------------------------------------------------------------------------
$ScanResults = [System.Collections.ArrayList]::new()

function Add-ScanResult {
    param(
        [string]$Label,
        [string]$Status,
        [string]$Problem = "",
        [string]$Fix     = ""
    )
    [void]$ScanResults.Add([PSCustomObject]@{
        Label   = $Label
        Status  = $Status
        Problem = $Problem
        Fix     = $Fix
    })
}

# ---------------------------------------------------------------------------
# Get-HttpStatus
# Synchronous HTTP request returning the integer status code.
# Returns 0 on connection failure (no response at all).
#
# @param Uri        Full URL
# @param Method     HTTP method (default GET)
# @param Headers    Hashtable of request headers
# @param Body       Optional request body string
# @param TimeoutSec Timeout in seconds (default 10)
# @returns Integer status code, 0 on failure
# ---------------------------------------------------------------------------
function Get-HttpStatus {
    param(
        [string]$Uri,
        [string]$Method     = "GET",
        [hashtable]$Headers = @{},
        [string]$Body       = $null,
        [int]$TimeoutSec    = 10
    )
    $params = @{
        Uri             = $Uri
        Method          = $Method
        Headers         = $Headers
        TimeoutSec      = $TimeoutSec
        UseBasicParsing = $true
        ErrorAction     = "Stop"
    }
    if ($Body) { $params["Body"] = $Body }
    try {
        $response = Invoke-WebRequest @params
        return [int]$response.StatusCode
    }
    catch [System.Net.WebException] {
        if ($_.Exception.Response) {
            return [int]$_.Exception.Response.StatusCode
        }
        return 0
    }
    catch { return 0 }
}

# ===========================================================================
# Startup
# ===========================================================================

Load-DotEnv

# Build host-side URL: replace 'host.docker.internal' → 'localhost'
# because that hostname resolves inside Docker but not on a Windows host.
$RawApiUrl = [System.Environment]::GetEnvironmentVariable("BKNOWLEDGE_API_URL", "Process")
$HostUrl   = $RawApiUrl -replace "host\.docker\.internal", "localhost"

$ChatToken   = [System.Environment]::GetEnvironmentVariable("BKNOWLEDGE_CHAT_TOKEN", "Process")
$LlmKey      = [System.Environment]::GetEnvironmentVariable("LLM_JUDGE_API_KEY",    "Process")
$LlmProvider = [System.Environment]::GetEnvironmentVariable("LLM_JUDGE_PROVIDER",   "Process")
if ([string]::IsNullOrWhiteSpace($LlmProvider)) { $LlmProvider = "openai" }

# ===========================================================================
# HEADER
# ===========================================================================

Write-Host ""
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "  RAG Evaluation Runner" -ForegroundColor Cyan
Write-Host "========================================================="  -ForegroundColor Cyan
Write-Host ""

# ===========================================================================
# STEP 1 — Scan all requirements
#
# All six checks run to completion before any result is shown.
# This way you see every issue at once, not just the first one.
# ===========================================================================

Write-Host "STEP 1 / 2  Pre-flight checks" -ForegroundColor Cyan
Write-Host "  Scanning..."
Write-Host ""

# Dependency flags — some checks are skipped when their prerequisites fail
$EnvOk = $false   # true once .env is valid and all required vars are loaded
$BkOk  = $false   # true once B-Knowledge responds on /health

# ── [1/6]  Configuration file (.env) ──────────────────────────────────────

if (-not (Test-Path ".env")) {
    Add-ScanResult "[1/6]  Configuration file (.env)" "FAIL" `
        ".env file is missing." `
        "Open a terminal in evaluations\rag and run:`n  copy .env.example .env`nThen open .env and fill in BKNOWLEDGE_CHAT_TOKEN and LLM_JUDGE_API_KEY."
} else {
    $MissingVars = @("BKNOWLEDGE_API_URL","BKNOWLEDGE_CHAT_TOKEN","LLM_JUDGE_API_KEY") |
        Where-Object { [string]::IsNullOrWhiteSpace(
            [System.Environment]::GetEnvironmentVariable($_, "Process")) }
    if ($MissingVars.Count -gt 0) {
        Add-ScanResult "[1/6]  Configuration file (.env)" "FAIL" `
            "Missing required values: $($MissingVars -join ', ')" `
            "Open .env and fill in the empty fields.`nAsk a developer if you are unsure what values to use."
    } else {
        Add-ScanResult "[1/6]  Configuration file (.env)" "PASS"
        $EnvOk = $true
    }
}

# ── [2/6]  B-Knowledge system online ──────────────────────────────────────

if (-not $EnvOk -or [string]::IsNullOrWhiteSpace($HostUrl)) {
    Add-ScanResult "[2/6]  B-Knowledge system online" "SKIP"
} else {
    $HealthStatus = Get-HttpStatus -Uri "$HostUrl/health" -TimeoutSec 6
    if ($HealthStatus -eq 200) {
        Add-ScanResult "[2/6]  B-Knowledge system online" "PASS"
        $BkOk = $true
    } else {
        Add-ScanResult "[2/6]  B-Knowledge system online" "FAIL" `
            "Cannot reach $HostUrl (HTTP $HealthStatus)." `
            "Make sure B-Knowledge is running and accessible.`nCheck that BKNOWLEDGE_API_URL in .env points to the correct address."
    }
}

# ── [3/6]  Access token accepted ──────────────────────────────────────────
# Skipped when B-Knowledge is offline — result would be misleading.

if (-not $BkOk) {
    Add-ScanResult "[3/6]  Access token accepted" "SKIP"
} else {
    $TokenStatus = Get-HttpStatus `
        -Uri     "$HostUrl/api/chat/stream" `
        -Method  "POST" `
        -Headers @{ Authorization = "Bearer $ChatToken"; "Content-Type" = "application/json"; Accept = "text/event-stream" } `
        -Body    '{"question":"ping"}' `
        -TimeoutSec 10
    if ($TokenStatus -eq 401 -or $TokenStatus -eq 403) {
        Add-ScanResult "[3/6]  Access token accepted" "FAIL" `
            "Token rejected (HTTP $TokenStatus)." `
            "Get a new token from B-Knowledge:`n  1. Open B-Knowledge > Settings > Embed Tokens`n  2. Create a new token for Chat App`n  3. Update BKNOWLEDGE_CHAT_TOKEN in .env"
    } elseif ($TokenStatus -eq 0) {
        Add-ScanResult "[3/6]  Access token accepted" "FAIL" `
            "No response from the server." `
            "B-Knowledge may still be starting up. Wait 30 seconds and run again."
    } else {
        Add-ScanResult "[3/6]  Access token accepted" "PASS"
    }
}

# ── [4/6]  AI judge key valid ─────────────────────────────────────────────

if (-not $EnvOk -or [string]::IsNullOrWhiteSpace($LlmKey)) {
    Add-ScanResult "[4/6]  AI judge key ($LlmProvider)" "SKIP"
} else {
    if ($LlmProvider -eq "anthropic") {
        $LlmStatus = Get-HttpStatus `
            -Uri     "https://api.anthropic.com/v1/models" `
            -Headers @{ "x-api-key" = $LlmKey; "anthropic-version" = "2023-06-01" } `
            -TimeoutSec 10
    } else {
        $LlmStatus = Get-HttpStatus `
            -Uri     "https://api.openai.com/v1/models" `
            -Headers @{ Authorization = "Bearer $LlmKey" } `
            -TimeoutSec 10
    }
    if ($LlmStatus -eq 200) {
        Add-ScanResult "[4/6]  AI judge key ($LlmProvider)" "PASS"
    } else {
        Add-ScanResult "[4/6]  AI judge key ($LlmProvider)" "FAIL" `
            "API key rejected or expired (HTTP $LlmStatus)." `
            "Update LLM_JUDGE_API_KEY in .env with a valid $LlmProvider key."
    }
}

# ── [5/6]  Evaluation dataset ready ───────────────────────────────────────

if (-not (Test-Path "dataset\eval_dataset.yaml")) {
    Add-ScanResult "[5/6]  Evaluation dataset" "FAIL" `
        "dataset\eval_dataset.yaml not found." `
        "Export Q&A from Easy Dataset (http://localhost:1717) then run:`n  python scripts\json_to_yaml.py dataset\export_alpaca.json dataset\eval_dataset.yaml"
} elseif ((Get-Content "dataset\eval_dataset.yaml" -Raw -ErrorAction SilentlyContinue) -notmatch "question:") {
    Add-ScanResult "[5/6]  Evaluation dataset" "FAIL" `
        "dataset\eval_dataset.yaml exists but appears empty or invalid." `
        "Re-run: python scripts\json_to_yaml.py dataset\export_alpaca.json dataset\eval_dataset.yaml"
} else {
    Add-ScanResult "[5/6]  Evaluation dataset" "PASS"
}

# ── [6/6]  Docker image available ─────────────────────────────────────────

$DockerRaw  = docker compose images rag-evaluator 2>&1
$DockerExit = $LASTEXITCODE

if ($DockerExit -ne 0) {
    $msg = ($DockerRaw -join " ").ToLower()
    if ($msg -match "connect|daemon|pipe|desktop|socket") {
        Add-ScanResult "[6/6]  Evaluation engine (Docker)" "FAIL" `
            "Docker Desktop is not running." `
            "Start Docker Desktop and wait until the system tray icon shows 'Engine running'.`nThen run this script again."
    } else {
        Add-ScanResult "[6/6]  Evaluation engine (Docker)" "FAIL" `
            "Unexpected Docker error." `
            "Ask a developer to check the Docker setup: make build"
    }
} else {
    $ImageLines = ($DockerRaw | Where-Object { $_ -match "\S" }) -as [array]
    if ($ImageLines.Count -lt 2) {
        Add-ScanResult "[6/6]  Evaluation engine (Docker)" "FAIL" `
            "Docker image not built yet." `
            "Ask a developer to run: make build"
    } else {
        Add-ScanResult "[6/6]  Evaluation engine (Docker)" "PASS"
    }
}

# ===========================================================================
# Print full scan table
# ===========================================================================

Write-Host ""
foreach ($r in $ScanResults) {
    $padded = "  {0,-44}" -f $r.Label
    Write-Host -NoNewline $padded
    switch ($r.Status) {
        "PASS" { Write-Host "OK"      -ForegroundColor Green   }
        "FAIL" { Write-Host "FAILED"  -ForegroundColor Red     }
        "SKIP" { Write-Host "skipped" -ForegroundColor DarkGray }
    }
}
Write-Host "  -------------------------------------------------------"

# ===========================================================================
# If any failures — list all blockers and exit
# ===========================================================================

$Failures = @($ScanResults | Where-Object { $_.Status -eq "FAIL" })

if ($Failures.Count -gt 0) {
    $plural = if ($Failures.Count -eq 1) { "blocker" } else { "blockers" }
    Write-Host ""
    Write-Host "  $($Failures.Count) $plural found. Fix everything listed below, then run this script again." -ForegroundColor Red
    Write-Host ""
    foreach ($f in $Failures) {
        Write-Host "  $($f.Label)" -ForegroundColor Red
        Write-Host "    Problem : $($f.Problem)"
        $firstLine = $true
        $f.Fix -split "`n" | ForEach-Object {
            if ($firstLine) { Write-Host "    Fix     : $_"; $firstLine = $false }
            else             { Write-Host "              $_" }
        }
        Write-Host ""
    }
    exit 1
}

Write-Host ""
Write-Host "  All checks passed - starting evaluation." -ForegroundColor Green
Write-Host ""

# ===========================================================================
# STEP 2 — Run evaluation + generate report
# ===========================================================================

Write-Host "STEP 2 / 2  Running evaluation" -ForegroundColor Cyan
Write-Host "  -------------------------------------------------------"
Write-Host ""
Write-Host "  This may take 1–3 hours depending on dataset size." -ForegroundColor Yellow
Write-Host "  You can safely leave it running and check back later." -ForegroundColor Yellow
Write-Host ""

# Clean previous results so this run starts from a known state
$CleanTargets = @(
    "results\eval_output.json", "results\eval_summary.md", "results\report.html",
    "__pycache__", "providers\__pycache__", "metrics\__pycache__",
    "scripts\__pycache__", ".promptfoo"
)
foreach ($t in $CleanTargets) {
    if (Test-Path $t) { Remove-Item -Recurse -Force $t }
}
New-Item -ItemType Directory -Force -Path "results" | Out-Null

$EvalDataset = [System.Environment]::GetEnvironmentVariable("PROMPTFOO_DATASET_PATH", "Process")
if ([string]::IsNullOrWhiteSpace($EvalDataset)) { $EvalDataset = "dataset/eval_dataset.yaml" }

# ── Single container run: promptfoo eval → generate_summary ───────────────
# Both commands run inside the same container instance to avoid double spin-up.

Write-Host "  Running evaluation and generating report..." -ForegroundColor White
Write-Host ""

cmd /c "docker compose run --rm -e PROMPTFOO_DATASET_PATH=$EvalDataset rag-evaluator sh -c ""promptfoo eval -c promptfooconfig.yaml && python3 scripts/generate_summary.py"""

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "  Evaluation did not complete successfully." -ForegroundColor Red
    Write-Host "  Check the output above for details, or contact a developer."
    Write-Host "  Raw results (if any): results\eval_output.json"
    exit 1
}

# ── Done ──────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "=========================================================" -ForegroundColor Green
Write-Host "  Evaluation complete" -ForegroundColor Green
Write-Host "=========================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Summary report saved at:" -ForegroundColor White
Write-Host "    results\eval_summary.md"
Write-Host ""
Write-Host "  --> Next step: send this file to Tech Lead for review." -ForegroundColor Yellow
Write-Host ""
Write-Host "  -------------------------------------------------------"
Write-Host "  For Tech Lead / Developer:" -ForegroundColor Cyan
Write-Host "    View interactive HTML report:"
Write-Host "      docker compose run --rm rag-evaluator promptfoo view"
Write-Host "      then open: http://localhost:15500"
Write-Host "    Raw data: results\eval_output.json"
Write-Host ""

