# Picture Parser — Detail Design

> **Module**: `advance-rag/rag/app/picture.py`
> **Parser Type**: `ParserType.PICTURE`
> **Category**: Media Processing
> **Role**: Parser for images and video files using OCR and CV LLM

---

## 1. Overview

The Picture Parser handles image and video files by extracting textual content through OCR (Optical Character Recognition) and Computer Vision LLM models. For images, it first attempts OCR text extraction and falls back to vision LLM description when OCR yields insufficient text. For videos, it uses the vision LLM directly to generate text descriptions. Each image or video produces a single chunk with the extracted/generated text and the original media as an attachment.

---

## 2. Use Cases

| Use Case | Description |
|----------|-------------|
| **Scanned documents** | Image files of scanned pages (JPG, PNG) |
| **Diagrams & charts** | Technical diagrams, flowcharts, architecture images |
| **Screenshots** | UI screenshots, error screenshots |
| **Photographs** | Photos with text (signs, labels, whiteboards) |
| **Video content** | Training videos, demo recordings, presentations |
| **Infographics** | Data visualizations, marketing materials |

---

## 3. Supported Formats

### Images
| Format | Notes |
|--------|-------|
| JPG/JPEG | Most common |
| PNG | Supports transparency |
| GIF | Static extraction (first frame) |
| BMP | Bitmap images |
| TIFF | High-resolution scans |
| WebP | Modern web format |

### Videos
| Format | Notes |
|--------|-------|
| MP4 | Most common; Gemini-compatible |
| MOV | Apple QuickTime |
| AVI | Windows video |
| MKV | Matroska container |
| WebM | Web video format |
| FLV | Flash video |

---

## 4. Design

### 4.1 Architecture Diagram

```
                    ┌──────────────┐
                    │   chunk()    │
                    └──────┬───────┘
                           │
              ┌────────────▼────────────┐
              │  Detect: Image or Video │
              └────┬──────────────┬─────┘
                   │              │
    ┌──────────────▼────────┐  ┌─▼────────────────┐
    │   IMAGE Path          │  │   VIDEO Path      │
    └──────────────┬────────┘  └─┬────────────────┘
                   │              │
    ┌──────────────▼────────┐  ┌─▼────────────────┐
    │  OCR Extraction       │  │  CV LLM call     │
    │  (Tesseract via       │  │  (Gemini or      │
    │   deepdoc.vision.OCR) │  │   configured     │
    │                       │  │   IMAGE2TEXT)     │
    └──────────────┬────────┘  └─┬────────────────┘
                   │              │
    ┌──────────────▼────────┐    │
    │  OCR text sufficient? │    │
    │  (length check)       │    │
    └───┬────────────┬──────┘    │
        │ YES        │ NO        │
        │     ┌──────▼──────┐    │
        │     │  CV LLM     │    │
        │     │  fallback   │    │
        │     │  (describe  │    │
        │     │   image)    │    │
        │     └──────┬──────┘    │
        │            │           │
        └────────────┼───────────┘
                     │
        ┌────────────▼────────────┐
        │  Create single chunk    │
        │  text + image/video     │
        │  attachment             │
        └────────────┬────────────┘
                     │
        ┌────────────▼────────────┐
        │  tokenize_chunks()      │
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

### 5.1 Image Processing — Dual-Path Extraction

**Step 1: OCR extraction**
1. Load image from binary data
2. Run OCR via `deepdoc.vision.OCR` (Tesseract-based)
3. Extract text with position data

**Step 2: Quality check**
- If OCR result is "short" (e.g., fewer than a configurable threshold of characters), the text may be insufficient (image is a diagram, photo, or low-quality scan)

**Step 3: CV LLM fallback**
- Load tenant's `IMAGE2TEXT` model via `LLMBundle`
- Send the image to the vision model (e.g., Gemini)
- The model generates a description: "This image shows a system architecture diagram with three microservices connected via an API gateway..."
- The LLM description replaces or supplements the OCR text

### 5.2 Video Processing — CV LLM Only

Videos are processed exclusively through the CV LLM:

1. Determine the video MIME type (Gemini requires specific MIME types)
2. Send the video binary to the `IMAGE2TEXT` model
3. Use the configured `video_prompt` (or default prompt) to request a description
4. The model generates a textual summary of the video content
5. The description becomes the chunk text

**Supported Gemini MIME types**: `video/mp4`, `video/mov`, `video/avi`, `video/mkv`, `video/webm`, `video/flv`

### 5.3 LLM Model Loading

The CV LLM is loaded lazily:

```python
# Load tenant-specific IMAGE2TEXT model
llm = LLMBundle(tenant_id, model_config, lang="English")

# For images
description = llm.describe_image(image_bytes)

# For videos
description = llm.describe_video(video_bytes, mime_type, prompt)
```

The model configuration comes from the tenant's LLM settings stored in the database.

### 5.4 Single Chunk Output

Each image or video produces exactly **one chunk**:
- The chunk's `content_with_weight` contains the OCR text or LLM description
- The chunk's `image` field contains the original image (for images) or a keyframe (for videos)
- This image is stored to S3 and referenced in search results for visual preview

### 5.5 Video Prompt Configuration

The video description prompt is configurable:
- Default prompt asks for a detailed description of the video content
- Custom prompts can be set via `parser_config["video_prompt"]`
- This allows tailoring the LLM output for specific use cases (e.g., "Describe the code shown in this screen recording")

---

## 6. Output Example

```python
# Image with OCR text
{
    "content_with_weight": "System Architecture\n\nAPI Gateway → Auth Service → User Service\n                        → Product Service\n                        → Order Service\n\nAll services communicate via gRPC",
    "content_ltks": ["system", "architecture", "api", "gateway", "auth", "service"],
    "docnm_kwd": "architecture-diagram.png",
    "image": "<PIL.Image object>",
    "page_num_int": [0]
}

# Video with LLM description
{
    "content_with_weight": "This video demonstrates the deployment process for the B-Knowledge application. It shows: 1) Running docker-compose to start infrastructure services, 2) Building the application with npm run build, 3) Starting the development server and verifying all services are healthy, 4) Uploading a test document and confirming successful parsing.",
    "content_ltks": ["video", "demonstrates", "deployment", "process", "docker", "compose"],
    "docnm_kwd": "deployment-demo.mp4",
    "image": "<PIL.Image keyframe>",
    "page_num_int": [0]
}
```

---

## 7. Differences from Other Parsers

| Aspect | Picture | Audio | Naive (images) |
|--------|---------|-------|----------------|
| Primary method | OCR + CV LLM | Speech-to-text | N/A (text documents) |
| Fallback | CV LLM for low OCR | None | N/A |
| Video support | Yes | No (audio only) | No |
| Output chunks | 1 per file | 1 per file | Many per file |
| LLM required | Only for fallback/video | Always (SPEECH2TEXT) | No |

---

## 8. Error Handling

| Scenario | Behavior |
|----------|----------|
| OCR produces no text | Falls back to CV LLM description |
| CV LLM unavailable | Returns chunk with OCR text only (may be empty) |
| Unsupported video format | Logs error, returns empty chunk via callback |
| Corrupt image file | Logs error, returns empty list |
| Very large image | May OOM; image is loaded into memory |
| Video too long for LLM | Depends on LLM provider's limits |

---

## 9. Dependencies

| Dependency | Purpose |
|------------|---------|
| `deepdoc/vision/ocr.py` | Tesseract OCR extraction |
| `LLMBundle` | IMAGE2TEXT model for vision descriptions |
| `PIL/Pillow` | Image loading and manipulation |
| `rag/nlp/rag_tokenizer.py` | Text tokenization |
