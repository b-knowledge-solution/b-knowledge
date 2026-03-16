# Converter (Python Worker)

Python 3 / Ubuntu 24.04 / LibreOffice / Redis queue / PDF post-processing

## Commands

```bash
# Development (from project root, after npm run setup)
npm run dev:converter       # Waits for backend health, then starts worker

# Manual run (from project root, with .venv activated)
source .venv/bin/activate
cd converter
python -m src.worker        # Main polling loop

# Docker
docker compose -f docker/docker-compose.yml up converter
```

## Purpose

Document converter worker that:
- Polls Redis for version-level conversion jobs (FIFO queue)
- Converts Office documents (Word, Excel, PowerPoint) to PDF
- Post-processes PDFs (empty page removal, whitespace trimming)
- Reports per-file progress via Redis pub/sub for SSE streaming

## Architecture

```
converter/src/
├── worker.py                  # Main polling loop (Redis → file processing)
├── config.py                  # Configuration dataclasses + Redis config parsing
├── converter.py               # Dispatcher: routes files by extension to converters
├── word_converter.py          # Word → PDF (LibreOffice CLI)
├── powerpoint_converter.py    # PowerPoint → PDF (LibreOffice CLI)
├── excel_converter.py         # Excel → PDF (Python-UNO bridge)
├── pdf_processor.py           # PDF post-processing (trim pages, whitespace)
└── logger.py                  # Loguru setup (console + rotating file)
```

## Key Patterns

### File Routing (converter.py)
| Extension | Converter | Method |
|-----------|-----------|--------|
| `.doc`, `.docx`, `.docm` | LibreOffice CLI | `soffice --convert-to pdf` |
| `.ppt`, `.pptx`, `.pptm` | LibreOffice CLI | `soffice --convert-to pdf` |
| `.xls`, `.xlsx`, `.xlsm` | Python-UNO bridge | Direct API for row/column control |
| `.pdf` | Copy | Direct pass-through to output |

### Worker Loop (worker.py)
1. Poll Redis for pending jobs (sorted set)
2. Check schedule window (configurable, e.g., 10PM-5AM) or manual trigger
3. Dequeue job → set status `converting`
4. Process files sequentially (2s delay between files)
5. Update per-file status: `pending` → `processing` → `completed`/`failed`
6. Publish progress to Redis pub/sub
7. Handle graceful shutdown (SIGTERM/SIGINT)

### Redis Key Layout
```
converter:vjob:{jobId}               # Hash: job metadata
converter:vjob:pending               # Sorted Set: pending job IDs
converter:vjob:status:{status}       # Set: job IDs by status
converter:files:{jobId}              # Set: file tracking IDs
converter:file:{fileId}              # Hash: per-file record
converter:manual_trigger             # String: "1" if active
converter:schedule:config            # Hash: schedule settings
```

### PDF Post-Processing (pdf_processor.py)
- **Empty page removal:** pdfminer content detection → removes blank pages
- **Whitespace trimming:** Analyzes content bounds → applies CropBox with margin
- **Parallel processing:** Multi-threaded for large PDFs (up to 8 workers)
- **Artifact filtering:** Ignores tiny/decorative elements, keeps text/images/vectors >5pt

### Configuration
Job-level config loaded from Redis job's `config` JSON field (set by backend):
- `PostProcessingConfig`: trim_whitespace, remove_empty_pages
- `SuffixConfig`: PDF filename suffixes (_d for Word, _x for Excel, _p for PowerPoint)
- `ExcelConfig`: orientation, row dimensions, shrink thresholds

## Gotchas

- **LibreOffice required:** Ubuntu package `libreoffice-calc libreoffice-writer libreoffice-impress` — not available on macOS dev without Docker
- **Python-UNO bridge:** Excel conversion uses `python3-uno` (LibreOffice Python API) — only works with system Python linked to LibreOffice
- **Schedule window:** Converter respects configurable time windows — jobs may queue but not process outside the window unless manually triggered
- **Shared filesystem:** Reads from backend's upload directory, writes to output directory — paths must be accessible to both services
- **2-second delay:** Intentional pause between files to avoid LibreOffice resource exhaustion

## Environment

| Variable | Default | Notes |
|----------|---------|-------|
| `REDIS_HOST` | localhost | |
| `REDIS_PORT` | 6379 | |
| `REDIS_PASSWORD` | (empty) | |
| `REDIS_URL` | (empty) | Overrides host/port if set |
| `POLL_INTERVAL` | 30 | Seconds between Redis polls |
| `CONVERTER_OUTPUT_DIR` | /app/.data/converted | Output directory |
| `UPLOAD_DIR` | ../be/uploads | Source files directory |

## Dependencies

7 packages: `redis`, `requests`, `pypdf`, `pdfminer.six`, `pyyaml`, `python-dotenv`, `loguru`
