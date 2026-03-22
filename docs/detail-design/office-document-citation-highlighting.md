# Citation Highlighting for PPTX & DOCX Files

## Problem Statement

B-Knowledge currently supports PDF citation highlighting: when a RAG search returns a chunk, the system displays the source PDF with bounding-box highlights showing exactly where the cited text appears. This works because the PDF parser extracts position coordinates (`page_number, x0, x1, y0, y1`) during chunking and stores them in OpenSearch.

**Goal:** Extend the same citation-highlight experience to DOCX and PPTX files.

---

## Current Architecture (PDF Only)

```
┌──────────┐     ┌──────────────┐     ┌───────────┐     ┌──────────┐
│ PDF File │────▶│ Parser       │────▶│ Splitter  │────▶│OpenSearch│
│          │     │ (pdfminer/   │     │ (chunks + │     │ (stores  │
│          │     │  Docling)    │     │ positions)│     │ position │
│          │     │              │     │           │     │ _int)    │
└──────────┘     └──────────────┘     └───────────┘     └──────────┘
                                                              │
                                                              ▼
┌──────────┐     ┌──────────────┐     ┌───────────────────────────┐
│ PDF      │◀────│ Frontend     │◀────│ Search API returns        │
│ Viewer   │     │ buildChunk   │     │ positions: [[page,x1,x2,  │
│ (react-  │     │ Highlights() │     │            y1,y2], ...]   │
│  pdf)    │     │              │     │                           │
└──────────┘     └──────────────┘     └───────────────────────────┘
```

**Position format in OpenSearch:** `position_int: [[page_num, x0, x1, y0, y1], ...]`

**Key files:**
- `advance-rag/deepdoc/parser/pdf_parser.py` — Position tag extraction
- `advance-rag/rag/flow/splitter/splitter.py` — Position merging during chunking
- `advance-rag/rag/nlp/__init__.py` — `add_positions()` function
- `be/src/modules/rag/services/rag-search.service.ts` — Search result mapping
- `fe/src/utils/document-util.ts` — `buildChunkHighlights()` for PDF viewer

---

## Approaches for DOCX & PPTX

### Approach 1: Convert to PDF, Reuse Existing Highlighting (Recommended)

**Strategy:** Convert Office files to PDF via LibreOffice, then use the existing PDF position extraction and highlighting pipeline.

```
┌──────────┐     ┌────────────┐     ┌──────────┐     ┌───────────┐
│ DOCX/    │────▶│ LibreOffice│────▶│ PDF      │────▶│ Existing  │
│ PPTX     │     │ --convert  │     │ (faithful│     │ PDF       │
│          │     │   -to pdf  │     │  layout) │     │ Pipeline  │
└──────────┘     └────────────┘     └──────────┘     └───────────┘
```

**This is what B-Knowledge's converter already does.** The converter worker (`converter/`) uses LibreOffice headless to convert DOCX/PPTX to PDF. The converted PDF then goes through the same RAG pipeline as native PDFs.

**Pros:**
- Zero new code for position extraction or frontend highlighting
- Consistent experience across all document types
- Already implemented in the converter pipeline
- PDF layout is faithful to the original Office document

**Cons:**
- Requires LibreOffice as a dependency (already present)
- Minor layout differences between LibreOffice and Microsoft Office rendering
- Extra conversion step adds processing time
- Users see a PDF viewer instead of a native DOCX/PPTX viewer

**Implementation:**
1. Ensure all DOCX/PPTX files go through the converter before RAG parsing
2. Store both original file and converted PDF
3. Use converted PDF for the viewer + highlighting
4. Link to original file for download

---

### Approach 2: Native Office Viewer + Convert-to-PDF for Positions

**Strategy:** Use a native Office document viewer in the frontend, but still convert to PDF server-side to extract position coordinates, then map those positions back to the native viewer.

**For DOCX:**
- **docx-preview (docxjs)** — Renders DOCX as HTML in the browser
  - GitHub: https://github.com/VolodymyrBaydalka/docxjs (~900 stars)
  - npm: `docx-preview` (197+ dependent projects)
  - Renders DOCX XML structure directly to HTML/CSS
  - Preserves page layout, styles, tables, images
  - Does NOT provide position-to-element mapping

- **mammoth.js** — Converts DOCX to clean semantic HTML
  - GitHub: https://github.com/mwilliamson/mammoth.js (~5.2k stars)
  - Focuses on semantic conversion, not visual fidelity
  - Does NOT preserve page layout or coordinates
  - Better for content extraction than visual preview

**For PPTX:**
- **pptx-preview.js** — Renders PPTX slides in the browser
  - Demo: https://develop365.gitlab.io/office-viewer/pptx-preview/
  - Pure client-side PPTX parsing and rendering
  - Renders slides as HTML/SVG

**Pros:**
- More native look-and-feel for Office documents
- No PDF conversion needed for viewing

**Cons:**
- Position mapping between PDF coordinates and HTML DOM is extremely complex
- Two rendering engines (LibreOffice PDF vs browser HTML) will produce different layouts
- Coordinate systems don't align — makes highlighting unreliable
- Significant development effort with fragile results

**Verdict:** Not recommended due to the coordinate mapping problem.

---

### Approach 3: Native Parsing with Position Extraction (No PDF)

**Strategy:** Extract text positions directly from DOCX/PPTX file formats using their native coordinate systems.

#### PPTX (More Feasible)

PPTX files store shape positions natively. Each shape has explicit coordinates:

```python
from pptx import Presentation
from pptx.util import Emu

prs = Presentation('slides.pptx')
for slide_num, slide in enumerate(prs.slides):
    for shape in slide.shapes:
        if shape.has_text_frame:
            # Bounding box in EMU (English Metric Units, 1 inch = 914400 EMU)
            left = shape.left      # x0
            top = shape.top        # y0
            right = left + shape.width   # x1
            bottom = top + shape.height  # y1
            text = shape.text_frame.text
```

**python-pptx** provides:
- `shape.left`, `shape.top` — Position in EMU
- `shape.width`, `shape.height` — Size in EMU
- `shape.text_frame.text` — Text content
- Slide dimensions via `prs.slide_width`, `prs.slide_height`

Reference: https://python-pptx.readthedocs.io/en/latest/dev/analysis/shp-pos-and-size.html

**Implementation for PPTX:**
1. Parse each slide, extract text + shape bounding box
2. Convert EMU to normalized coordinates (fraction of slide dimensions)
3. Store positions as `[slide_num, x0, x1, y0, y1]` in OpenSearch
4. Frontend renders slides as images/SVG and overlays highlights

#### DOCX (Less Feasible)

DOCX files do **NOT** store paragraph positions. Text flows dynamically based on:
- Page size, margins, columns
- Font metrics, line spacing
- Renderer implementation (Word vs LibreOffice vs browser)

**python-docx** provides paragraph text and styles but **no coordinates**. To get coordinates, you must render the document (which is what converting to PDF does).

**Workaround for DOCX:** Use paragraph-index-based matching instead of coordinates:
1. During chunking, record paragraph indices (e.g., paragraphs 15-22)
2. In the viewer, render DOCX as HTML with data-attributes on each paragraph
3. Highlight by paragraph index rather than bounding box

```python
from docx import Document

doc = Document('report.docx')
for idx, para in enumerate(doc.paragraphs):
    # Store paragraph index with chunk
    chunk_metadata = {
        'paragraph_start': start_idx,
        'paragraph_end': end_idx,
        'text': para.text
    }
```

**Pros:**
- No PDF conversion needed
- True native document experience
- PPTX coordinates are reliable (shapes have fixed positions)

**Cons:**
- DOCX has no reliable position data — paragraph-index matching is approximate
- Need to build custom viewers for both formats
- PPTX slide rendering in browser is imperfect
- Significant frontend development effort

---

### Approach 4: RAG Document Viewer (Preprocess.co)

**Strategy:** Use the open-source RAG Document Viewer library that handles Office document highlighting out of the box.

- **GitHub:** https://github.com/preprocess-co/rag-document-viewer
- **License:** MIT
- **Website:** https://preprocess.co/rag-document-viewer

**How it works:**
1. Server-side: LibreOffice converts Office files to PDF
2. Server-side: pdf2htmlEX converts PDF to high-fidelity HTML
3. Client-side: Renders HTML in browser with highlight overlays
4. Accepts bounding-box coordinates from RAG chunks and auto-scrolls to highlights

**Key features:**
- Precise bounding-box highlights (same coordinate format as B-Knowledge)
- Chunk navigator (next/previous controls)
- Zoom controls
- Scrollbar indicators showing chunk positions
- 100% in-browser rendering (secure, no external servers)
- Supports DOCX, PPTX, XLSX, and many other formats

**Dependencies:**
- LibreOffice 24.2+ (already available in B-Knowledge)
- pdf2htmlEX 0.18.8+ (new dependency)

**Pros:**
- Purpose-built for RAG citation highlighting
- Supports all Office formats via LibreOffice → PDF → HTML pipeline
- MIT licensed, open source
- Bounding-box highlight API matches B-Knowledge's `position_int` format
- Active development

**Cons:**
- Additional dependency (pdf2htmlEX)
- Users see an HTML rendering, not the original document format
- Requires evaluating integration effort with B-Knowledge's frontend
- Relatively new project — may need stability testing

---

## Comparison Matrix

| Criteria | Approach 1: PDF Convert | Approach 2: Native + PDF Map | Approach 3: Native Parse | Approach 4: RAG Doc Viewer |
|---|---|---|---|---|
| **Development effort** | Minimal | Very High | High | Medium |
| **Highlight accuracy** | High | Low (mapping issues) | PPTX: High, DOCX: Low | High |
| **DOCX support** | Yes | Yes (visual only) | Partial (no positions) | Yes |
| **PPTX support** | Yes | Yes (visual only) | Yes (native positions) | Yes |
| **New dependencies** | None | docx-preview, pptx-preview | Custom viewers | pdf2htmlEX |
| **User experience** | PDF viewer for all | Native look | Native look | HTML viewer |
| **Maintenance** | Low | High | Medium | Low-Medium |
| **Coordinate reliability** | High | Low | PPTX only | High |

---

## Recommended Strategy

### Phase 1: PDF Conversion (Immediate — Already Supported)

Use Approach 1. The converter already converts DOCX/PPTX to PDF. Ensure:
1. Converted PDFs are stored alongside originals
2. RAG pipeline processes the converted PDF (not the original Office file)
3. PDF viewer + existing highlight pipeline handles the rest
4. Original file available for download

**This requires no new code** — just ensuring the pipeline routes Office files correctly.

### Phase 2: Evaluate RAG Document Viewer (Short-term)

Evaluate Approach 4 (Preprocess.co RAG Document Viewer) as an upgrade:
1. Install pdf2htmlEX alongside LibreOffice
2. Generate HTML previews during conversion
3. Replace PDF.js viewer with RAG Document Viewer for Office-originated files
4. Keep existing PDF viewer for native PDFs

### Phase 3: Native PPTX Positions (Optional, Long-term)

For PPTX specifically, Approach 3 is viable because slides have fixed-position shapes:
1. Extend `advance-rag/deepdoc/parser/ppt_parser.py` to extract shape bounding boxes
2. Convert EMU coordinates to a normalized format
3. Store alongside chunk text in OpenSearch
4. Build a slide-based viewer component with highlight overlays

---

## Libraries Reference

### DOCX Libraries

| Library | GitHub | Stars | Type | Position Support |
|---|---|---|---|---|
| docx-preview (docxjs) | [VolodymyrBaydalka/docxjs](https://github.com/VolodymyrBaydalka/docxjs) | ~900 | Browser renderer | No |
| mammoth.js | [mwilliamson/mammoth.js](https://github.com/mwilliamson/mammoth.js) | ~5.2k | DOCX → HTML | No |
| docx (dolanmiu) | [dolanmiu/docx](https://github.com/dolanmiu/docx) | ~5k | DOCX generator | N/A |
| python-docx | [python-openxml/python-docx](https://github.com/python-openxml/python-docx) | ~4.8k | Python parser | No (paragraphs only) |
| Apryse WebViewer | [apryse.com](https://apryse.com/capabilities/docx-editor) | Commercial | Full viewer + annotations | Yes (commercial) |

### PPTX Libraries

| Library | GitHub | Stars | Type | Position Support |
|---|---|---|---|---|
| python-pptx | [scanny/python-pptx](https://github.com/scanny/python-pptx) | ~2.3k | Python parser | Yes (shape EMU coords) |
| PptxGenJS | [gitbrent/PptxGenJS](https://github.com/gitbrent/PptxGenJS) | ~2.8k | PPTX generator | N/A |
| pptx-preview.js | [develop365 demo](https://develop365.gitlab.io/office-viewer/pptx-preview/) | — | Browser renderer | No |
| react-pptx | [wyozi/react-pptx](https://github.com/wyozi/react-pptx) | ~300 | React PPTX gen | N/A |

### Multi-Format / RAG-Specific

| Library | GitHub | Stars | Type | Position Support |
|---|---|---|---|---|
| RAG Document Viewer | [preprocess-co/rag-document-viewer](https://github.com/preprocess-co/rag-document-viewer) | ~200+ | RAG viewer + highlights | Yes (bbox coordinates) |
| Docling (IBM) | [docling-project/docling](https://github.com/docling-project/docling) | ~10k+ | Document parser | PDF: Yes, DOCX: No, PPTX: Partial |
| pdf2htmlEX | [pdf2htmlEX/pdf2htmlEX](https://github.com/pdf2htmlEX/pdf2htmlEX) | ~3.5k+ | PDF → high-fidelity HTML | Preserves positions in HTML |

### Commercial Solutions

| Product | Type | Formats | Highlight Support |
|---|---|---|---|
| [Apryse WebViewer](https://apryse.com/capabilities/docx-editor) | Client-side SDK | DOCX, PPTX, XLSX, PDF | Full annotation + highlights |
| [Nutrient Web SDK](https://www.nutrient.io/blog/how-to-build-a-powerpoint-viewer-using-javascript/) (formerly PSPDFKit) | Client-side SDK | DOCX, PPTX, PDF | Full annotation + highlights |

Both commercial solutions convert Office formats to PDF client-side and then provide PDF-based annotation tools — essentially Approach 1 done entirely in the browser. Commercial licensing required.

---

## How Other RAG Platforms Handle This

### RAGFlow
- Converts all Office files to PDF first, then uses PDF parser for position extraction
- Same approach as B-Knowledge's current pipeline
- Known issues: Word documents can't scroll past first page in preview; citation persistence bugs in chat history ([ragflow#8817](https://github.com/infiniflow/ragflow/issues/8817))
- Source: B-Knowledge's codebase is based on RAGFlow's parser architecture

### Dify
- Does not provide document-level citation highlighting
- Returns chunk text with source document reference but no positional highlighting
- Focuses on text-based citations rather than visual document highlighting

### Quivr
- Similar to Dify — text-based citations without visual highlighting
- No bounding-box position extraction

### Preprocess.co
- Uses LibreOffice + pdf2htmlEX pipeline
- Provides the RAG Document Viewer (open source) for rendering + highlighting
- Most complete solution for multi-format citation highlighting

### Docling (IBM Research)
- Universal document parser ([docling-project/docling](https://github.com/docling-project/docling))
- **PDF:** Full bounding-box support via layout analysis + TableFormer models
- **DOCX:** No bounding boxes — confirmed by maintainers ([discussion#997](https://github.com/docling-project/docling/discussions/997), [issue#2015](https://github.com/docling-project/docling/issues/2015)). Format fundamentally does not store positions.
- **PPTX:** Partial — slide-level metadata via python-pptx shape positions
- Has OpenSearch integration: [Building RAG pipelines with Docling and OpenSearch](https://opensearch.org/blog/building-powerful-rag-pipelines-with-docling-and-opensearch/)
- Supports `HierarchicalChunker` and `HybridChunker` with provenance metadata

### ChatDOC
- Converts everything to PDF for citation-backed responses with highlighted source regions
- Same fundamental approach as Approach 1

---

## Technical Details: PPTX Position Extraction

If implementing native PPTX position extraction (Phase 3), here's the approach:

### Coordinate System

PPTX uses EMU (English Metric Units): `1 inch = 914400 EMU`

```python
# Slide dimensions (standard 16:9)
slide_width = 12192000   # EMU = 13.33 inches
slide_height = 6858000   # EMU = 7.5 inches
```

### Extraction Code Pattern

```python
from pptx import Presentation
from pptx.util import Emu

def extract_pptx_positions(file_path: str) -> list[dict]:
    """Extract text content with bounding box positions from PPTX slides.

    Args:
        file_path: Path to the PPTX file.

    Returns:
        List of dicts with text, slide_num, and position coordinates.
    """
    prs = Presentation(file_path)
    slide_w = prs.slide_width
    slide_h = prs.slide_height
    results = []

    for slide_idx, slide in enumerate(prs.slides):
        # Sort shapes by reading order (top-to-bottom, left-to-right)
        shapes = sorted(
            [s for s in slide.shapes if s.has_text_frame],
            key=lambda s: (s.top, s.left)
        )

        for shape in shapes:
            text = shape.text_frame.text.strip()
            if not text:
                continue

            # Normalize to fraction of slide dimensions
            x0 = round(shape.left / slide_w, 4)
            y0 = round(shape.top / slide_h, 4)
            x1 = round((shape.left + shape.width) / slide_w, 4)
            y1 = round((shape.top + shape.height) / slide_h, 4)

            results.append({
                'text': text,
                'slide_num': slide_idx,
                'position': [slide_idx, x0, x1, y0, y1],
            })

    return results
```

### Integration with Existing Pipeline

Store positions in the same `position_int` format:
```python
# Convert normalized coords to integer format matching PDF positions
position_int = [slide_num + 1, int(x0 * 1000), int(x1 * 1000), int(y0 * 1000), int(y1 * 1000)]
```

---

## Technical Details: DOCX Paragraph-Index Approach

Since DOCX lacks position data, use paragraph indexing as an alternative:

### Extraction

```python
from docx import Document

def extract_docx_paragraphs(file_path: str) -> list[dict]:
    """Extract paragraphs with their indices from a DOCX file.

    Args:
        file_path: Path to the DOCX file.

    Returns:
        List of dicts with text and paragraph index.
    """
    doc = Document(file_path)
    results = []

    for idx, para in enumerate(doc.paragraphs):
        text = para.text.strip()
        if not text:
            continue
        results.append({
            'text': text,
            'paragraph_index': idx,
            'style': para.style.name,
        })

    return results
```

### Frontend Highlighting (with docx-preview)

```typescript
// After rendering DOCX with docx-preview, add data attributes to paragraphs
const paragraphs = container.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li')
paragraphs.forEach((p, idx) => {
  p.setAttribute('data-para-idx', String(idx))
})

// Highlight by paragraph range
function highlightParagraphs(startIdx: number, endIdx: number) {
  for (let i = startIdx; i <= endIdx; i++) {
    const el = container.querySelector(`[data-para-idx="${i}"]`)
    if (el) {
      el.classList.add('chunk-highlight')
      if (i === startIdx) el.scrollIntoView({ behavior: 'smooth' })
    }
  }
}
```

**Limitation:** Paragraph indices may not align between python-docx parsing and docx-preview rendering if the renderers handle elements differently (e.g., list items, table cells, nested elements).

---

## Key Insight: Why DOCX Cannot Have Native Bounding Boxes

DOCX files do **NOT** store paragraph/text positions. Page layout is a **rendering-time concept** that depends on:
- Page size, margins, columns
- Installed fonts and font metrics
- Line spacing, paragraph spacing
- Renderer implementation (Microsoft Word vs LibreOffice vs Google Docs vs browser)

This is confirmed by the Docling project maintainers and python-docx documentation. The only way to get bounding boxes for DOCX content is to **render it first** (i.e., convert to PDF).

PPTX is different: each shape has explicit `left`, `top`, `width`, `height` attributes in EMU coordinates, because slides have fixed dimensions and shapes are absolutely positioned.

---

## Decision Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-03-21 | Document approaches for DOCX/PPTX highlighting | Research phase |
| — | Phase 1: Use PDF conversion pipeline | Zero development cost, already works |
| — | Phase 2: Evaluate RAG Document Viewer | Best open-source multi-format solution |
| — | Phase 3: Consider native PPTX positions | Only format with reliable native coordinates |

---

## Sources

- [preprocess-co/rag-document-viewer](https://github.com/preprocess-co/rag-document-viewer) — MIT-licensed RAG viewer with highlight support
- [VolodymyrBaydalka/docxjs (docx-preview)](https://github.com/VolodymyrBaydalka/docxjs) — Browser DOCX renderer
- [mwilliamson/mammoth.js](https://github.com/mwilliamson/mammoth.js/) — DOCX to semantic HTML
- [docling-project/docling](https://github.com/docling-project/docling) — Universal document parser (IBM Research)
- [pdf2htmlEX/pdf2htmlEX](https://github.com/pdf2htmlEX/pdf2htmlEX) — High-fidelity PDF to HTML
- [python-pptx shape position docs](https://python-pptx.readthedocs.io/en/latest/dev/analysis/shp-pos-and-size.html)
- [Docling DOCX bounding box discussion](https://github.com/docling-project/docling/discussions/997)
- [Building RAG pipelines with Docling and OpenSearch](https://opensearch.org/blog/building-powerful-rag-pipelines-with-docling-and-opensearch/)
- [RAGFlow citation issues](https://github.com/infiniflow/ragflow/issues/8817)
- [Layout-Aware RAG with Evidence Pins (Docling + Neo4j)](https://vipulmshah.medium.com/layout-aware-rag-with-evidence-pins-building-clickable-citations-for-pdfs-using-docling-neo4j-5305769759f0)
- [Apryse WebViewer Office](https://docs.apryse.com/web/guides/office)
- [Nutrient PPTX viewer](https://www.nutrient.io/blog/how-to-build-a-powerpoint-viewer-using-javascript/)
- [Preprocess.co RAG Document Viewer product page](https://preprocess.co/rag-document-viewer)
