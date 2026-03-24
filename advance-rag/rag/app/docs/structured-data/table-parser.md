# Table Parser — Detail Design

> **Module**: `advance-rag/rag/app/table.py`
> **Parser Type**: `ParserType.TABLE`
> **Category**: Structured Data
> **Role**: Structured data parser for spreadsheets and CSV files

---

## 1. Overview

The Table Parser is designed for structured tabular data in Excel (XLSX/XLS) and CSV formats. Unlike the Naive Parser which treats spreadsheets as text, the Table Parser understands table structure — headers, data types, merged cells, and column relationships. Each row becomes a separate chunk with typed fields, enabling structured search and filtering by column values.

---

## 2. Use Cases

| Use Case | Description |
|----------|-------------|
| **Inventory databases** | Product catalogs, asset inventories in Excel |
| **Financial data** | Transaction logs, budget spreadsheets |
| **HR records** | Employee lists, organizational data |
| **Survey results** | Tabular survey/feedback data |
| **Reference tables** | Lookup tables, mapping data |
| **CRM exports** | Customer data exported from CRM systems |

---

## 3. Supported Formats

| Format | Notes |
|--------|-------|
| XLSX | Primary format; supports multi-sheet, merged cells |
| XLS | Legacy Excel format |
| CSV | Comma-separated values |
| TXT | Tab-separated or delimited text files |

---

## 4. Design

### 4.1 Architecture Diagram

```
                    ┌──────────────┐
                    │   chunk()    │
                    └──────┬───────┘
                           │
              ┌────────────▼────────────┐
              │  RAGFlowExcelParser     │
              │  Extract raw table data │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  Header Detection       │
              │  - Multi-level headers  │
              │  - Merged cell handling │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  Data Type Detection    │
              │  per column:            │
              │  int, float, text,      │
              │  datetime, bool         │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  Column Name Mapping    │
              │  - Display name → field │
              │  - Pinyin-based naming  │
              │  - Type suffix added    │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  Row-by-Row Chunking    │
              │  Each row = 1 chunk     │
              │  "- Field: Value" format│
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  Vision figure parsing  │
              │  (cell images, charts)  │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  Return typed chunks    │
              └────────────────────────┘
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

### 5.1 Header Detection

The parser handles complex header structures:

**Simple headers** (single row):
```
| Name | Age | Department | Salary |
```

**Multi-level headers** (merged cells spanning rows):
```
| Employee Info          | Compensation    |
| Name | Age | Department | Base | Bonus |
```

Multi-level headers are flattened by concatenating parent + child:
- "Employee Info > Name"
- "Employee Info > Age"
- "Compensation > Base"

### 5.2 Data Type Detection

For each column, the parser samples values to determine the data type:

| Detected Type | Field Suffix | OpenSearch Mapping | Example Values |
|---------------|-------------|-------------------|----------------|
| Integer | `_long` | `long` | 42, -1, 0 |
| Float | `_flt` | `float` | 3.14, 99.9 |
| Text | `_tks` | `text` (tokenized) | "John Smith" |
| DateTime | `_dt` | `date` | "2024-01-15" |
| Boolean | `_tks` | `text` | "true", "yes" |

**Detection algorithm**:
1. Sample first N non-empty values in the column
2. Try parsing as int → float → datetime → boolean
3. If no type matches, default to text (`_tks`)

### 5.3 Column Name Mapping

Column names are mapped to search-friendly field names:

1. **Chinese columns**: Converted to Pinyin (e.g., "姓名" → "xingming_tks")
2. **English columns**: Lowercased, spaces → underscores (e.g., "First Name" → "first_name_tks")
3. **Type suffix**: Appended based on detected data type
4. **Field map stored**: The column name → field name mapping is stored in `parser_config` for the frontend to render column headers

### 5.4 Row-by-Row Chunking

**Each row produces exactly one chunk**:

```python
# Row 3 example
{
    "content_with_weight": "- Name: John Smith\n- Age: 32\n- Department: Engineering\n- Salary: 95000",
    "name_tks": ["john", "smith"],
    "age_long": 32,
    "department_tks": ["engineering"],
    "salary_flt": 95000.0,
    "top_int": [3]  # Row number for position tracking
}
```

The `- Field: Value` format ensures:
- Human-readable content for display
- Each field individually searchable via typed fields
- Row position tracked via `top_int`

### 5.5 Vision Figure Parsing

For Excel files containing:
- **Embedded charts**: Extracted as images, described via CV LLM if available
- **Cell images**: Extracted and stored with the row chunk
- **Sparklines**: Converted to textual description if possible

### 5.6 Infinity/OceanBase Support

For Infinity or OceanBase vector stores, chunks include an additional field:

```python
chunk["chunk_data"] = {
    "name": "John Smith",
    "age": 32,
    "department": "Engineering",
    "salary": 95000
}
```

This JSON field contains all typed column values for structured queries.

---

## 6. Output Example

```python
{
    "content_with_weight": "- Product: Widget Pro X\n- SKU: WPX-2024-001\n- Price: 49.99\n- Stock: 1250\n- Category: Electronics",
    "content_ltks": ["product", "widget", "pro", "sku", "wpx", "price", "stock", "category", "electronics"],
    "content_sm_ltks": ["pro", "wid", "sku", ...],
    "docnm_kwd": "inventory-2024.xlsx",
    "product_tks": ["widget", "pro", "x"],
    "sku_tks": ["wpx", "2024", "001"],
    "price_flt": 49.99,
    "stock_long": 1250,
    "category_tks": ["electronics"],
    "top_int": [15],
    "chunk_data": {
        "product": "Widget Pro X",
        "sku": "WPX-2024-001",
        "price": 49.99,
        "stock": 1250,
        "category": "Electronics"
    }
}
```

---

## 7. Differences from Other Parsers

| Aspect | Table | Naive (Excel) | QA | Tag |
|--------|-------|---------------|-----|-----|
| Row-per-chunk | Yes | No (text merge) | Yes (Q&A pairs) | Yes (content-tag) |
| Typed fields | Yes (int, float, text, date) | No | No | No (tags only) |
| Column mapping | Yes (pinyin, suffixes) | No | No | No |
| Header detection | Multi-level, merged cells | Basic | 2-column assumed | 2-column assumed |
| Vision figures | Yes | No | No | No |
| Structured search | Yes | Text only | Text only | Tag-based |

---

## 8. Error Handling

| Scenario | Behavior |
|----------|----------|
| No header row | First row treated as headers |
| Mixed data types in column | Falls back to text type |
| Empty rows | Skipped (no empty chunks) |
| Merged cells in data | Value assigned to all spanned rows |
| Very wide tables (100+ columns) | All columns processed; performance may degrade |
| Special characters in headers | Sanitized in field names, preserved in display names |

---

## 9. Dependencies

| Dependency | Purpose |
|------------|---------|
| `deepdoc/parser/excel_parser.py` | Excel/CSV raw data extraction |
| `rag/nlp/rag_tokenizer.py` | Text field tokenization |
| `pypinyin` | Chinese column name → Pinyin conversion |

---

## 10. Frontend Integration

The Table Parser stores metadata that the frontend uses:

```python
parser_config["field_map"] = {
    "product_tks": "Product",
    "sku_tks": "SKU",
    "price_flt": "Price",
    "stock_long": "Stock",
    "category_tks": "Category"
}
```

This mapping allows the frontend to:
- Render column headers in search results
- Provide column-specific filters
- Display typed values appropriately (numbers, dates, text)
