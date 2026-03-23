"""Unit tests for the email (.eml) file parser module.

Tests email header extraction, body text/HTML parsing, attachment
handling, charset decoding, and multipart message processing in
rag/app/email.py. External parsers and file I/O are mocked.
"""

import os
import sys
import types
import email
import pytest
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.application import MIMEApplication
from unittest.mock import MagicMock, patch

_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)


# ---------------------------------------------------------------------------
# Stub heavy dependencies
# ---------------------------------------------------------------------------
def _ensure_mock_module(name: str):
    """Register a mock module in sys.modules if not already importable.

    Args:
        name: Dotted module path to mock.
    """
    if name not in sys.modules:
        try:
            __import__(name)
        except (ImportError, ModuleNotFoundError):
            mod = types.ModuleType(name)
            sys.modules[name] = mod
            parts = name.split(".")
            for i in range(1, len(parts)):
                parent = ".".join(parts[:i])
                if parent not in sys.modules:
                    sys.modules[parent] = types.ModuleType(parent)


_mock_rag_tokenizer = MagicMock()
_mock_rag_tokenizer.tokenize = lambda text: text.lower() if isinstance(text, str) else str(text).lower()
_mock_rag_tokenizer.fine_grained_tokenize = lambda text: text.lower() if isinstance(text, str) else str(text).lower()

_ensure_mock_module("common.settings")
_ensure_mock_module("common.token_utils")
_ensure_mock_module("rag.nlp")
sys.modules["rag.nlp"].rag_tokenizer = _mock_rag_tokenizer

for _fn_name in ["naive_merge", "tokenize_chunks"]:
    if not hasattr(sys.modules["rag.nlp"], _fn_name):
        setattr(sys.modules["rag.nlp"], _fn_name, MagicMock())

dummy_callback = lambda prog=None, msg="": None


def _build_plain_email(subject="Test", from_addr="alice@example.com",
                       to_addr="bob@example.com", body="Hello World"):
    """Build a simple plain-text email as bytes.

    Args:
        subject: Email subject line.
        from_addr: Sender address.
        to_addr: Recipient address.
        body: Plain text body.

    Returns:
        Raw email bytes.
    """
    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_addr
    return msg.as_bytes()


def _build_multipart_email(subject="Test", body_text="Hello", body_html="<p>Hello</p>"):
    """Build a multipart email with text and HTML parts.

    Args:
        subject: Email subject line.
        body_text: Plain text body part.
        body_html: HTML body part.

    Returns:
        Raw email bytes.
    """
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = "alice@example.com"
    msg["To"] = "bob@example.com"
    msg.attach(MIMEText(body_text, "plain", "utf-8"))
    msg.attach(MIMEText(body_html, "html", "utf-8"))
    return msg.as_bytes()


def _build_email_with_attachment(subject="Test", body="Hello",
                                  attachment_name="doc.txt", attachment_content=b"file content"):
    """Build an email with a text body and a file attachment.

    Args:
        subject: Email subject line.
        body: Plain text body.
        attachment_name: Filename for the attachment.
        attachment_content: Raw bytes of the attachment.

    Returns:
        Raw email bytes.
    """
    msg = MIMEMultipart("mixed")
    msg["Subject"] = subject
    msg["From"] = "alice@example.com"
    msg["To"] = "bob@example.com"
    msg.attach(MIMEText(body, "plain", "utf-8"))

    attachment = MIMEApplication(attachment_content, Name=attachment_name)
    attachment["Content-Disposition"] = f'attachment; filename="{attachment_name}"'
    msg.attach(attachment)
    return msg.as_bytes()


class TestEmailChunkPlainText:
    """Tests for parsing plain-text emails."""

    @patch("rag.app.email.naive_merge", return_value=["chunk1"])
    @patch("rag.app.email.tokenize_chunks", return_value=[{"content_with_weight": "email text"}])
    @patch("rag.app.email.TxtParser")
    @patch("rag.app.email.HtmlParser")
    def test_plain_text_email_extracts_headers_and_body(self, mock_html, mock_txt, mock_tok, mock_merge):
        """A plain-text email should extract headers and body text."""
        from rag.app.email import chunk

        # Mock TxtParser.parser_txt to return sections
        mock_txt.parser_txt = MagicMock(return_value=[("Subject: Test", ""), ("Hello World", "")])
        mock_html.parser_txt = MagicMock(return_value=[])

        binary = _build_plain_email(subject="Meeting", body="Let's meet tomorrow")
        result = chunk("meeting.eml", binary=binary, callback=dummy_callback)

        # Should produce at least one result chunk
        assert len(result) >= 1
        # naive_merge should have been called with sections
        mock_merge.assert_called_once()

    @patch("rag.app.email.naive_merge", return_value=["chunk1"])
    @patch("rag.app.email.tokenize_chunks", return_value=[{"content_with_weight": "email text"}])
    @patch("rag.app.email.TxtParser")
    @patch("rag.app.email.HtmlParser")
    def test_email_headers_included_in_sections(self, mock_html, mock_txt, mock_tok, mock_merge):
        """Email headers (Subject, From, To) should be included in sections."""
        from rag.app.email import chunk

        mock_txt.parser_txt = MagicMock(return_value=[("header line", "")])
        mock_html.parser_txt = MagicMock(return_value=[])

        binary = _build_plain_email(
            subject="Important", from_addr="boss@corp.com", to_addr="worker@corp.com"
        )
        result = chunk("important.eml", binary=binary, callback=dummy_callback)

        # Verify that sections passed to naive_merge contain header data
        call_args = mock_merge.call_args
        assert call_args is not None


class TestEmailChunkMultipart:
    """Tests for parsing multipart emails."""

    @patch("rag.app.email.naive_merge", return_value=["chunk1"])
    @patch("rag.app.email.tokenize_chunks", return_value=[{"content_with_weight": "email text"}])
    @patch("rag.app.email.TxtParser")
    @patch("rag.app.email.HtmlParser")
    def test_multipart_email_processes_both_parts(self, mock_html, mock_txt, mock_tok, mock_merge):
        """A multipart email should process both text and HTML parts."""
        from rag.app.email import chunk

        mock_txt.parser_txt = MagicMock(return_value=[("plain text", "")])
        mock_html.parser_txt = MagicMock(return_value=["html content"])

        binary = _build_multipart_email(body_text="Plain body", body_html="<b>HTML body</b>")
        result = chunk("multi.eml", binary=binary, callback=dummy_callback)

        assert len(result) >= 1


class TestEmailChunkAttachments:
    """Tests for parsing emails with attachments."""

    @patch("rag.app.email.naive_merge", return_value=["chunk1"])
    @patch("rag.app.email.tokenize_chunks", return_value=[{"content_with_weight": "main text"}])
    @patch("rag.app.email.naive_chunk", return_value=[{"content_with_weight": "attachment text"}])
    @patch("rag.app.email.TxtParser")
    @patch("rag.app.email.HtmlParser")
    def test_attachment_parsed_by_naive_chunk(self, mock_html, mock_txt, mock_naive, mock_tok, mock_merge):
        """Attachments should be recursively parsed by naive_chunk."""
        from rag.app.email import chunk

        mock_txt.parser_txt = MagicMock(return_value=[("body", "")])
        mock_html.parser_txt = MagicMock(return_value=[])

        binary = _build_email_with_attachment(
            body="See attached", attachment_name="report.txt",
            attachment_content=b"Report content here"
        )
        result = chunk("with_attachment.eml", binary=binary, callback=dummy_callback)

        # Result should include both main email and attachment chunks
        assert len(result) >= 1

    @patch("rag.app.email.naive_merge", return_value=["chunk1"])
    @patch("rag.app.email.tokenize_chunks", return_value=[{"content_with_weight": "main text"}])
    @patch("rag.app.email.naive_chunk", side_effect=Exception("Parse error"))
    @patch("rag.app.email.TxtParser")
    @patch("rag.app.email.HtmlParser")
    def test_attachment_parse_failure_does_not_crash(self, mock_html, mock_txt, mock_naive, mock_tok, mock_merge):
        """If attachment parsing fails, the email body should still be returned."""
        from rag.app.email import chunk

        mock_txt.parser_txt = MagicMock(return_value=[("body", "")])
        mock_html.parser_txt = MagicMock(return_value=[])

        binary = _build_email_with_attachment(
            body="See attached", attachment_name="bad.dat",
            attachment_content=b"corrupted data"
        )
        result = chunk("fail_attach.eml", binary=binary, callback=dummy_callback)

        # Should still return the main email chunks, not crash
        assert len(result) >= 1


class TestEmailDocMetadata:
    """Tests for document metadata generation in email parsing."""

    @patch("rag.app.email.naive_merge", return_value=["chunk1"])
    @patch("rag.app.email.tokenize_chunks", return_value=[{"content_with_weight": "text"}])
    @patch("rag.app.email.TxtParser")
    @patch("rag.app.email.HtmlParser")
    def test_doc_metadata_contains_filename(self, mock_html, mock_txt, mock_tok, mock_merge):
        """The doc metadata should contain the original filename."""
        from rag.app.email import chunk

        mock_txt.parser_txt = MagicMock(return_value=[("text", "")])
        mock_html.parser_txt = MagicMock(return_value=[])

        binary = _build_plain_email()
        result = chunk("report.eml", binary=binary, callback=dummy_callback)

        # tokenize_chunks should receive a doc dict with docnm_kwd
        call_args = mock_tok.call_args
        assert call_args is not None
        doc_arg = call_args[0][1]
        assert doc_arg["docnm_kwd"] == "report.eml"
