#Requires -Version 5.1

<#
.SYNOPSIS
    RAG Evaluation — Phase 4

.DESCRIPTION
    Runs the B-Knowledge RAG evaluation in two steps:

      STEP 1  Pre-flight checks (config, connectivity, dataset, Docker)
      STEP 2  Run evaluation + generate report

    No technical knowledge is needed to run this script.
    If something is wrong, a plain-language explanation is shown.

.EXAMPLE
    .\run-phase4.ps1
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
# Write-CheckPass / Write-CheckFail
# Uniform output line for each pre-flight check.
#
# @param Label   Check label shown in the progress line
# @param Hint    (Write-CheckFail only) Plain-language explanation
# ---------------------------------------------------------------------------
function Write-CheckPass {
    param([string]$Label)
    $line = "  {0,-44}" -f $Label
    Write-Host -NoNewline $line
    Write-Host "OK" -ForegroundColor Green
}

function Write-CheckFail {
    param([string]$Label, [string]$Hint)
    $line = "  {0,-44}" -f $Label
    Write-Host -NoNewline $line
    Write-Host "FAILED" -ForegroundColor Red
    Write-Host ""
    Write-Host "  What to do:" -ForegroundColor Red
    # Indent each line of the hint for readability
    $Hint -split "`n" | ForEach-Object { Write-Host "    $_" }
    Write-Host ""
    Write-Host "  Fix the issue above and run this script again." -ForegroundColor Red
    Write-Host ""
    exit 1
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
Write-Host "  RAG Evaluation - Phase 4" -ForegroundColor Cyan
Write-Host "========================================================="  -ForegroundColor Cyan
Write-Host ""

# ===========================================================================
# STEP 1 — Pre-flight checks
#
# All six checks run in order. The first one that fails prints a plain-
# language explanation and exits immediately before wasting time.
# ===========================================================================

Write-Host "STEP 1 / 2  Pre-flight checks" -ForegroundColor Cyan
Write-Host "  -------------------------------------------------------"
Write-Host ""

# ── 1/6  Configuration file (.env) ────────────────────────────────────────

if (-not (Test-Path ".env")) {
    Write-CheckFail "[1/6]  Configuration file (.env)" @"
The configuration file .env is missing.
Ask a developer to set it up:
  copy .env.example .env
  # Then fill in BKNOWLEDGE_API_URL, BKNOWLEDGE_CHAT_TOKEN, LLM_JUDGE_API_KEY
"@
}

$MissingVars = @("BKNOWLEDGE_API_URL","BKNOWLEDGE_CHAT_TOKEN","LLM_JUDGE_API_KEY") |
    Where-Object { [string]::IsNullOrWhiteSpace(
        [System.Environment]::GetEnvironmentVariable($_, "Process")) }

if ($MissingVars.Count -gt 0) {
    Write-CheckFail "[1/6]  Configuration file (.env)" @"
The following required values are empty in .env:
  $($MissingVars -join ', ')

Open .env in any text editor and fill in the missing values.
Ask a developer if you are not sure what the correct values are.
"@
}

Write-CheckPass "[1/6]  Configuration file (.env)"

# ── 2/6  B-Knowledge system is online ─────────────────────────────────────

$HealthStatus = Get-HttpStatus -Uri "$HostUrl/health" -TimeoutSec 6

if ($HealthStatus -ne 200) {
    Write-CheckFail "[2/6]  B-Knowledge system online" @"
Cannot reach the B-Knowledge system.
  Address : $HostUrl
  Response: HTTP $HealthStatus

Things to check:
  1. Is B-Knowledge running?
  2. Is BKNOWLEDGE_API_URL correct in .env?
"@
}

Write-CheckPass "[2/6]  B-Knowledge system online"

# ── 3/6  Access token is accepted ─────────────────────────────────────────

$TokenStatus = Get-HttpStatus `
    -Uri     "$HostUrl/api/chat/stream" `
    -Method  "POST" `
    -Headers @{ Authorization = "Bearer $ChatToken"; "Content-Type" = "application/json"; Accept = "text/event-stream" } `
    -Body    '{"question":"ping"}' `
    -TimeoutSec 10

if ($TokenStatus -eq 401 -or $TokenStatus -eq 403) {
    Write-CheckFail "[3/6]  Access token accepted" @"
The access token was rejected by the B-Knowledge system (HTTP $TokenStatus).
BKNOWLEDGE_CHAT_TOKEN in .env is invalid or has expired.

To get a new token:
  1. Open B-Knowledge in your browser
  2. Go to Settings -> Embed Tokens
  3. Create a new token for Chat App
  4. Paste the new value into BKNOWLEDGE_CHAT_TOKEN in .env
"@
}

if ($TokenStatus -eq 0) {
    Write-CheckFail "[3/6]  Access token accepted" @"
No response from $HostUrl/api/chat/stream.
The server may still be starting up. Wait a moment and try again.
"@
}

Write-CheckPass "[3/6]  Access token accepted"

# ── 4/6  AI judge key is valid ────────────────────────────────────────────

if ($LlmProvider -eq "anthropic") {
    $LlmStatus = Get-HttpStatus `
        -Uri     "https://api.anthropic.com/v1/models" `
        -Headers @{ "x-api-key" = $LlmKey; "anthropic-version" = "2023-06-01" } `
        -TimeoutSec 10
}
else {
    $LlmStatus = Get-HttpStatus `
        -Uri     "https://api.openai.com/v1/models" `
        -Headers @{ Authorization = "Bearer $LlmKey" } `
        -TimeoutSec 10
}

if ($LlmStatus -ne 200) {
    Write-CheckFail "[4/6]  AI judge key valid ($LlmProvider)" @"
The AI judge API key is invalid or has expired (HTTP $LlmStatus).
Provider: $LlmProvider

To fix:
  1. Get a valid API key from your AI provider
  2. Update LLM_JUDGE_API_KEY in .env
"@
}

Write-CheckPass "[4/6]  AI judge key valid ($LlmProvider)"

# ── 5/6  Evaluation dataset is ready ──────────────────────────────────────

if (-not (Test-Path "dataset\eval_dataset.yaml")) {
    Write-CheckFail "[5/6]  Evaluation dataset" @"
The evaluation question file (dataset\eval_dataset.yaml) was not found.
This file is created in Phase 2 (dataset preparation).
If Phase 2 is complete, ask a developer to verify the file is in place.
"@
}

$DatasetContent = Get-Content "dataset\eval_dataset.yaml" -Raw -ErrorAction SilentlyContinue
if ($DatasetContent -notmatch "question:") {
    Write-CheckFail "[5/6]  Evaluation dataset" @"
The dataset file exists but appears to be empty or invalid.
Ask a developer to check: dataset\eval_dataset.yaml
"@
}

Write-CheckPass "[5/6]  Evaluation dataset"

# ── 6/6  Docker image is available ────────────────────────────────────────

$DockerImages = docker compose images rag-evaluator 2>&1
$ImageLines   = ($DockerImages | Where-Object { $_ -match "\S" }) -as [array]

if ($ImageLines.Count -lt 2) {
    Write-CheckFail "[6/6]  Evaluation engine (Docker)" @"
The evaluation engine Docker image has not been built yet.
Ask a developer to build it:
  make build
"@
}

Write-CheckPass "[6/6]  Evaluation engine (Docker)"

# ── All checks passed ──────────────────────────────────────────────────────

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

# ── 2a  Run promptfoo evaluation ──────────────────────────────────────────

Write-Host "  Running evaluation questions..." -ForegroundColor White
Write-Host ""

cmd /c "docker compose run --rm -e PROMPTFOO_DATASET_PATH=$EvalDataset rag-evaluator promptfoo eval -c promptfooconfig.yaml"

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "  Evaluation did not complete successfully." -ForegroundColor Red
    Write-Host "  Check the output above for details, or contact a developer."
    exit 1
}

Write-Host ""

# ── 2b  Generate summary report ───────────────────────────────────────────

Write-Host "  Generating report..." -ForegroundColor White
Write-Host ""

cmd /c "docker compose run --rm rag-evaluator python3 scripts/generate_summary.py"

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "  Evaluation completed but the report could not be generated." -ForegroundColor Yellow
    Write-Host "  Raw results are saved in: results\eval_output.json"
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

