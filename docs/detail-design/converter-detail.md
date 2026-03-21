# Document Converter Detail Design

## Overview

The Converter is a Python worker that transforms office documents into PDF format. It polls a Redis sorted set for jobs, converts files via LibreOffice or Python-UNO, optionally post-processes the PDFs, and uploads results to S3-compatible storage.

## Conversion Pipeline

```mermaid
sequenceDiagram
    participant BE as Backend
    participant Redis as Redis
    participant Worker as Converter Worker
    participant LO as LibreOffice / UNO
    participant S3 as RustFS (S3)

    BE->>Redis: ZADD converter:vjob:pending (job)
    BE->>Redis: HSET converter:vjob:{id} (job metadata)
    BE->>Redis: HSET converter:file:{id} (file metadata)

    loop Poll every 30s
        Worker->>Redis: ZPOPMIN converter:vjob:pending
        alt Job found
            Redis-->>Worker: Job data
            Worker->>Redis: HSET status=converting
            Worker->>S3: Download source file
            S3-->>Worker: File bytes

            Worker->>LO: Convert to PDF
            LO-->>Worker: PDF bytes

            opt PDF post-processing enabled
                Worker->>Worker: Remove empty pages
                Worker->>Worker: Trim whitespace margins
            end

            Worker->>S3: Upload converted PDF
            Worker->>Redis: PUBLISH converter:progress:{jobId}
            Worker->>Redis: HSET status=completed
        else No job
            Redis-->>Worker: Empty
        end
    end
```

## Conversion Routes

| Input Extension | Method | Notes |
|----------------|--------|-------|
| `.doc`, `.docx` | `soffice --convert-to pdf` | LibreOffice headless |
| `.ppt`, `.pptx` | `soffice --convert-to pdf` | LibreOffice headless |
| `.xls`, `.xlsx` | Python-UNO bridge | More control over sheet layout |
| `.pdf` | Copy / pass-through | Only post-processing if enabled |
| `.txt`, `.csv` | `soffice --convert-to pdf` | Simple text conversion |

## Worker Loop

```mermaid
flowchart TD
    A[Start Worker] --> B[Poll Redis]
    B --> C{Job in queue?}
    C -->|No| D[Wait 30s]
    D --> B
    C -->|Yes| E{Within schedule window?}
    E -->|No| F[Re-enqueue job]
    F --> D
    E -->|Yes| G[Download file from S3]
    G --> H{Route by extension}
    H -->|Office docs| I[LibreOffice convert]
    H -->|Excel| J[Python-UNO convert]
    H -->|PDF| K[Skip conversion]
    I --> L{Post-processing?}
    J --> L
    K --> L
    L -->|Yes| M[Remove empty pages]
    M --> N[Trim whitespace]
    N --> O[Upload to S3]
    L -->|No| O
    O --> P[Update status]
    P --> Q[2s delay]
    Q --> B
```

## PDF Post-Processing

### Remove Empty Pages (Optional)

Uses pdfminer to analyze content on each page. Pages with no extractable text and no significant graphical elements are removed. This handles blank pages inserted by LibreOffice during conversion.

### Trim Whitespace (Optional)

Adjusts the CropBox of each PDF page to remove excessive whitespace margins. A configurable margin (default 10pt) is preserved around the content bounding box.

## Redis Data Structures

### Job Hash: `converter:vjob:{id}`

| Field | Type | Description |
|-------|------|-------------|
| id | string | Job ID |
| status | string | `pending`, `converting`, `completed`, `failed` |
| tenant_id | string | Owning tenant |
| total_files | number | Files in this job |
| completed_files | number | Processed count |
| created_at | string | ISO timestamp |

### Pending Queue: `converter:vjob:pending`

Redis sorted set. Score is the job creation timestamp (priority ordering). Workers use `ZPOPMIN` for atomic dequeue.

### File Hash: `converter:file:{id}`

| Field | Type | Description |
|-------|------|-------------|
| id | string | File ID |
| job_id | string | Parent job |
| source_key | string | S3 key of source file |
| target_key | string | S3 key of converted PDF |
| status | string | `pending`, `processing`, `completed`, `failed` |
| error | string | Error message if failed |

## State Transitions

```mermaid
stateDiagram-v2
    [*] --> pending: Job created

    state "Job States" as JS {
        pending --> converting: Worker picks up
        converting --> completed: All files done
        converting --> failed: Unrecoverable error
    }

    state "File States" as FS {
        state "pending" as fp
        state "processing" as fpr
        state "completed" as fc
        state "failed" as ff
        fp --> fpr: Worker starts file
        fpr --> fc: Conversion success
        fpr --> ff: Conversion error
    }
```

## Progress Reporting

The worker publishes progress via Redis pub/sub on channel `converter:progress:{jobId}`. The backend subscribes and bridges updates to the frontend via Socket.IO.

## Key Files

| File | Purpose |
|------|---------|
| `converter/src/worker.py` | Main worker loop and polling |
| `converter/src/converter.py` | Conversion routing and LibreOffice invocation |
| `converter/src/pdf_processor.py` | Post-processing (empty page removal, trimming) |
| `converter/src/redis_client.py` | Redis operations |
| `converter/src/s3_client.py` | S3 upload/download |
