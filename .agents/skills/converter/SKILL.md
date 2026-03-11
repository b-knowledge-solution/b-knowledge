---
name: b-knowledge-converter
description: Converter worker development skill — enforces B-Knowledge converter architecture for Office-to-PDF conversion
---

# B-Knowledge Converter Worker Development Skill

Use this skill when modifying or extending the `converter/` Python workspace.

## Stack

- Python 3.10+, Redis task queue, LibreOffice for Office-to-PDF
- loguru for logging, dataclasses for config
- No web framework — standalone worker polling Redis

## Architecture

```
converter/
├── src/
│   ├── worker.py              # Main loop: poll Redis, dispatch jobs, track status
│   ├── converter.py           # Format dispatcher: route file to correct converter
│   ├── word_converter.py      # .doc/.docx/.docm → PDF (LibreOffice CLI)
│   ├── powerpoint_converter.py# .ppt/.pptx/.pptm → PDF (LibreOffice CLI)
│   ├── excel_converter.py     # .xls/.xlsx/.xlsm → PDF (LibreOffice UNO bridge)
│   ├── pdf_processor.py       # Post-processing: remove empty pages, trim whitespace
│   ├── config.py              # Dataclass-based config loaded from Redis job data
│   ├── logger.py              # loguru setup
│   └── __init__.py
├── requirements.txt
├── Dockerfile                 # Ubuntu 24.04 + LibreOffice + Python
└── start.sh                   # WSL startup script (Windows dev)
```

## Conventions

### Code Style
- Type hints on all function signatures and return types
- Docstrings with `@param` and `@returns` on every public function
- Functions over classes (except config dataclasses)
- Use `loguru` logger from `src.logger`, not stdlib `logging`
- Constants in `UPPER_SNAKE_CASE` at module top
- Use `os.path.join` for cross-platform path handling

### Error Handling
- Wrap conversion in try/except, capture error message
- Update Redis file status to `'failed'` with error string
- Log at appropriate levels: `logger.debug` for progress, `logger.error` for failures
- Graceful shutdown on SIGTERM/SIGINT

---

## Redis Key Patterns

These MUST match the backend constants in `be/src/shared/services/`:

```
converter:vjob:{jobId}                  # Hash: version job metadata
converter:vjob:pending                  # Sorted Set: pending job IDs (by timestamp)
converter:vjob:status:{status}          # Set: job IDs grouped by status
converter:version:active_job:{verId}    # String: active job ID for a version
converter:files:{jobId}                 # Set: file tracking IDs in this job
converter:file:{fileId}                 # Hash: per-file tracking record
converter:manual_trigger                # String: "1" if manual trigger active
converter:schedule:config               # Hash: schedule settings (startHour, endHour, etc.)
```

### File Status Flow

```
pending → processing → completed
                    → failed
```

---

## Adding a New File Type Converter

### Step 1: Create converter module

Create `src/<type>_converter.py`:

```python
from loguru import logger


def convert_<type>_to_pdf(input_path: str, output_dir: str) -> str:
    """
    Convert a <type> file to PDF.
    @param input_path: Absolute path to the source file.
    @param output_dir: Directory for the output PDF.
    @returns: Path to the generated PDF file.
    """
    logger.info(f"Converting {input_path} to PDF")

    # Conversion logic here
    output_path = os.path.join(output_dir, "output.pdf")

    logger.info(f"Conversion complete: {output_path}")
    return output_path
```

### Step 2: Register in dispatcher

In `src/converter.py`, add the file extension to `is_office_file()` and call the new converter in `convert_to_pdf()`:

```python
# In is_office_file():
SUPPORTED_EXTENSIONS = {'.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.<new_ext>'}

# In convert_to_pdf():
if ext in ('.new_ext',):
    return convert_new_type_to_pdf(input_path, output_dir)
```

### Step 3: Add doc type mapping

In `src/config.py`, update `get_doc_type()` to map the new extension to its category.

### Step 4: Add suffix mapping

Each converter type has a filename suffix to avoid collisions:
- Word: `_d`
- PowerPoint: `_p`
- Excel: `_x`
- New type: `_<letter>`

---

## Post-processing Pattern

PDF post-processing in `src/pdf_processor.py`:

```python
def process_pdf(
    pdf_path: str,
    remove_empty: bool = False,
    trim: bool = False,
    trim_margin: int = 0,
) -> str:
    """
    Post-process a converted PDF file.
    @param pdf_path: Path to the PDF to process.
    @param remove_empty: Remove blank pages from the PDF.
    @param trim: Trim whitespace margins around content.
    @param trim_margin: Margin to preserve in points.
    @returns: Path to the processed PDF.
    """
```

---

## Config Pattern

Use dataclasses for configuration, loaded from Redis job data:

```python
from dataclasses import dataclass, field


@dataclass
class TrimWhitespaceConfig:
    """Configuration for whitespace trimming."""
    enabled: bool = False
    margin: int = 10


@dataclass
class PostProcessingConfig:
    """Configuration for PDF post-processing."""
    remove_empty_pages: bool = False
    trim_whitespace: TrimWhitespaceConfig = field(default_factory=TrimWhitespaceConfig)
```

---

## Checklist for Changes

1. [ ] Type hints on all new function signatures and return types
2. [ ] Docstrings with `@param` / `@returns` on all public functions
3. [ ] Use `logger` from `src.logger` for all logging
4. [ ] Redis key patterns match backend constants
5. [ ] Update file status in Redis at each transition (pending → processing → completed/failed)
6. [ ] Handle errors gracefully — update status to `'failed'` with error message
7. [ ] Test with actual Office files of the target format
8. [ ] Update `requirements.txt` if new dependencies added

## Key Files Reference

- `converter/src/worker.py` — Main polling loop and job orchestration
- `converter/src/converter.py` — Format dispatcher
- `converter/src/config.py` — Dataclass config definitions
- `converter/src/pdf_processor.py` — PDF post-processing
- `converter/src/logger.py` — loguru setup
- `converter/requirements.txt` — Python dependencies
- `converter/Dockerfile` — Container build (Ubuntu + LibreOffice)
