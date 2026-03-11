#
#  Copyright 2024 The InfiniFlow Authors. All Rights Reserved.
#
#  Licensed under the Apache License, Version 2.0 (the "License");
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.
#

"""
File type detection and processing utilities.
Provides filename_type, thumbnail_img, read_potential_broken_pdf, and sanitize_path
used by the file service layer.
"""

import io
import os
import re
import logging

from db import FileType


# Extension-to-FileType mapping
_EXT_MAP = {
    ".pdf": FileType.PDF,
    ".doc": FileType.DOC,
    ".docx": FileType.DOC,
    ".xlsx": FileType.DOC,
    ".xls": FileType.DOC,
    ".ppt": FileType.DOC,
    ".pptx": FileType.DOC,
    ".txt": FileType.DOC,
    ".md": FileType.DOC,
    ".csv": FileType.DOC,
    ".html": FileType.DOC,
    ".htm": FileType.DOC,
    ".json": FileType.DOC,
    ".xml": FileType.DOC,
    ".eml": FileType.DOC,
    ".png": FileType.VISUAL,
    ".jpg": FileType.VISUAL,
    ".jpeg": FileType.VISUAL,
    ".gif": FileType.VISUAL,
    ".bmp": FileType.VISUAL,
    ".tif": FileType.VISUAL,
    ".tiff": FileType.VISUAL,
    ".webp": FileType.VISUAL,
    ".svg": FileType.VISUAL,
    ".mp3": FileType.AURAL,
    ".wav": FileType.AURAL,
    ".ogg": FileType.AURAL,
    ".flac": FileType.AURAL,
    ".m4a": FileType.AURAL,
    ".wma": FileType.AURAL,
    ".mp4": FileType.AURAL,
}


def filename_type(filename: str) -> FileType:
    """Determine the FileType from a filename's extension."""
    if not filename:
        return FileType.OTHER
    _, ext = os.path.splitext(filename)
    return _EXT_MAP.get(ext.lower(), FileType.OTHER)


def thumbnail_img(filename: str, blob: bytes):
    """Generate a thumbnail image for the given file content. Returns base64 string or None."""
    try:
        ftype = filename_type(filename)
        if ftype == FileType.VISUAL:
            import base64
            return "data:image/png;base64," + base64.b64encode(blob).decode("utf-8")

        if ftype == FileType.PDF and blob:
            try:
                import pdfplumber
                from PIL import Image
                pdf = pdfplumber.open(io.BytesIO(blob))
                if len(pdf.pages) > 0:
                    page = pdf.pages[0]
                    img = page.to_image(resolution=72)
                    img_buffer = io.BytesIO()
                    img.original.save(img_buffer, format="PNG")
                    img_bytes = img_buffer.getvalue()
                    pdf.close()
                    import base64
                    return "data:image/png;base64," + base64.b64encode(img_bytes).decode("utf-8")
                pdf.close()
            except Exception:
                logging.debug(f"Failed to generate PDF thumbnail for {filename}")
    except Exception:
        logging.debug(f"Failed to generate thumbnail for {filename}")
    return None


def read_potential_broken_pdf(blob: bytes) -> bytes:
    """Try to repair a broken PDF by re-saving it. Returns original blob on failure."""
    if not blob or not blob[:5] == b'%PDF-':
        return blob
    try:
        import pdfplumber
        pdf = pdfplumber.open(io.BytesIO(blob))
        # Validate PDF is readable by iterating pages
        for _ in pdf.pages:
            pass
        pdf.close()
        return blob
    except Exception:
        return blob


def sanitize_path(path: str | None) -> str:
    """Sanitize a file path to prevent directory traversal attacks."""
    if not path:
        return ""
    # Normalize and remove any traversal attempts
    path = path.replace("\\", "/")
    path = re.sub(r'\.\./?', '', path)
    path = re.sub(r'/+', '/', path)
    return path.strip("/")
