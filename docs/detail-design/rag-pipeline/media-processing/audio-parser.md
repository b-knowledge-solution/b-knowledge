# Audio Parser — Detail Design

> **Module**: `advance-rag/rag/app/audio.py`
> **Parser Type**: `ParserType.AUDIO`
> **Category**: Media Processing
> **Role**: Parser for audio files using speech-to-text transcription

---

## 1. Overview

The Audio Parser converts audio files into searchable text using the tenant's configured speech-to-text (SPEECH2TEXT) LLM model. The audio binary is written to a temporary file, transcribed by the LLM, and the resulting text becomes a single chunk. This is the simplest LLM-dependent parser in the pipeline.

---

## 2. Use Cases

| Use Case | Description |
|----------|-------------|
| **Meeting recordings** | Transcribe meeting audio for knowledge base |
| **Podcast episodes** | Index podcast content for search |
| **Voice notes** | Short voice memos and dictations |
| **Interviews** | Research or HR interview recordings |
| **Customer calls** | Support call recordings for analysis |
| **Lectures** | Academic or training lecture recordings |

---

## 3. Supported Formats

| Format | Extension | Notes |
|--------|-----------|-------|
| WAV | .wav | Uncompressed; highest quality |
| MP3 | .mp3 | Most common compressed format |
| AAC | .aac | Apple/Android default |
| FLAC | .flac | Lossless compression |
| OGG | .ogg | Open format |
| AIFF | .aiff | Apple uncompressed |
| AU | .au | Sun/NeXT format |
| MIDI | .midi | Synthesizer (limited utility) |
| WMA | .wma | Windows Media Audio |

---

## 4. Design

### 4.1 Architecture Diagram

```
                    ┌──────────────┐
                    │   chunk()    │
                    └──────┬───────┘
                           │
              ┌────────────▼────────────┐
              │  Write binary to temp   │
              │  file (preserve ext)    │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  Load SPEECH2TEXT       │
              │  LLM model (tenant)    │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  Transcribe audio       │
              │  via LLM model          │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  Create single chunk    │
              │  from transcription     │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  Cleanup temp file      │
              │  (in finally block)     │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  Return [chunk]         │
              └─────────────────────────┘
```

### 4.2 Function Signature

```python
def chunk(
    filename: str,
    binary: bytes,
    from_page: int = 0,
    to_page: int = 100000,
    lang: str = "English",
    callback=None,
    **kwargs
) -> list[dict]:
```

---

## 5. Business Logic

### 5.1 Temporary File Handling

The audio binary cannot be sent directly to most speech-to-text APIs — it must be written to a temporary file first:

1. Extract the file extension from `filename`
2. Create a temporary file with the same extension (e.g., `/tmp/tmpXXXXXX.mp3`)
3. Write the binary content to the temp file
4. Pass the temp file path to the LLM model
5. **Always** delete the temp file in a `finally` block to prevent disk leaks

```python
try:
    # Write to temp file
    tmp_path = write_temp_file(binary, extension)

    # Transcribe
    text = llm.transcribe(tmp_path)

    # Create chunk
    ...
finally:
    # Cleanup
    os.unlink(tmp_path)
```

### 5.2 LLM Model Loading

The SPEECH2TEXT model is loaded from tenant configuration:

```python
llm = LLMBundle(tenant_id, model_config, model_type=LLMType.SPEECH2TEXT)
transcription = llm.transcribe(audio_file_path)
```

Common SPEECH2TEXT models:
- OpenAI Whisper
- Azure Speech Services
- Google Speech-to-Text

### 5.3 Single Chunk Output

The entire transcription becomes a **single chunk**:
- No splitting or merging is applied
- For very long audio files, this can result in a very large chunk
- The transcription text is tokenized normally for search

### 5.4 Progress Reporting

- Progress callback is called with `1.0` on success
- On failure, callback reports the error and progress is set to a negative value

---

## 6. Output Example

```python
{
    "content_with_weight": "Welcome to today's meeting. We'll be discussing the Q3 roadmap and prioritizing features for the next sprint. First, let's review the current status of the authentication module...",
    "content_ltks": ["welcome", "today", "meeting", "discussing", "roadmap", "prioritizing"],
    "content_sm_ltks": ["wel", "tod", "mee", ...],
    "docnm_kwd": "team-standup-2024-03-15.mp3",
    "title_tks": [],
    "image": None,
    "page_num_int": [0]
}
```

---

## 7. Differences from Picture Parser

| Aspect | Audio | Picture |
|--------|-------|---------|
| Input type | Audio files | Images + videos |
| Extraction method | SPEECH2TEXT LLM | OCR + IMAGE2TEXT LLM |
| Fallback | None | OCR → CV LLM |
| LLM always required | Yes | Only for fallback/video |
| Temp file needed | Yes | No (binary passed directly) |
| Media attachment | None | Image stored in chunk |

---

## 8. Error Handling

| Scenario | Behavior |
|----------|----------|
| SPEECH2TEXT model not configured | Error reported via callback; returns empty list |
| Transcription fails | Logs error, cleans up temp file, returns empty list |
| Corrupt audio file | LLM may return empty/error; logged and reported |
| Very long audio (>1 hour) | Depends on LLM provider limits; may timeout |
| Temp file write fails | Error reported; no cleanup needed |
| Disk space for temp file | System-level; may fail on full disk |

---

## 9. Dependencies

| Dependency | Purpose |
|------------|---------|
| `LLMBundle` | SPEECH2TEXT model for transcription |
| `tempfile` | Temporary file management |
| `rag/nlp/rag_tokenizer.py` | Text tokenization |

---

## 10. Limitations

- **No speaker diarization**: The parser does not identify different speakers
- **No timestamps**: Transcription text does not include time markers
- **Single chunk**: Long audio produces a single large chunk (may exceed embedding limits)
- **LLM dependency**: Requires a configured SPEECH2TEXT model; fails without one
- **No streaming**: The entire file must be transcribed before producing output
