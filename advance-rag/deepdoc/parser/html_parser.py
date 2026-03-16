# -*- coding: utf-8 -*-
#
#  Copyright 2025 The InfiniFlow Authors. All Rights Reserved.
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
"""HTML file parser for the RAG pipeline.

Parses HTML documents into text chunks suitable for embedding and retrieval.
Handles block-level elements, inline text, and tables. Cleans up scripts,
styles, and comments before extracting content. Chunks are sized according
to configurable token limits.
"""

from rag.nlp import find_codec, rag_tokenizer
import uuid
import chardet
from bs4 import BeautifulSoup, NavigableString, Tag, Comment
import html


def get_encoding(file):
    """Detect the character encoding of a file.

    Args:
        file: Path to the file to detect encoding for.

    Returns:
        The detected encoding name string.
    """
    with open(file,'rb') as f:
        tmp = chardet.detect(f.read())
        return tmp['encoding']


# HTML block-level elements that define content boundaries
BLOCK_TAGS = [
    "h1", "h2", "h3", "h4", "h5", "h6",
    "p", "div", "article", "section", "aside",
    "ul", "ol", "li",
    "table", "pre", "code", "blockquote",
    "figure", "figcaption"
]

# Mapping from heading tags to Markdown-style heading prefixes
TITLE_TAGS = {"h1": "#", "h2": "##", "h3": "###", "h4": "#####", "h5": "#####", "h6": "######"}


class RAGFlowHtmlParser:
    """Parser for HTML files that extracts text content into token-limited chunks.

    Recursively traverses the HTML DOM, groups text by block-level elements,
    and splits the result into chunks that respect token count limits.
    Tables are extracted separately and appended as raw HTML.
    """

    def __call__(self, fnm, binary=None, chunk_token_num=512):
        """Parse an HTML file or binary data into text chunks.

        Args:
            fnm: File path to the HTML file.
            binary: Raw bytes of the HTML content. Overrides fnm if provided.
            chunk_token_num: Maximum number of tokens per chunk.

        Returns:
            A list of text chunk strings.
        """
        if binary:
            encoding = find_codec(binary)
            txt = binary.decode(encoding, errors="ignore")
        else:
            with open(fnm, "r",encoding=get_encoding(fnm)) as f:
                txt = f.read()
        return self.parser_txt(txt, chunk_token_num)

    @classmethod
    def parser_txt(cls, txt, chunk_token_num):
        """Parse raw HTML text into token-limited chunks.

        Cleans the HTML (removes scripts, styles, inline styles, comments),
        extracts text and tables, then chunks the text blocks.

        Args:
            txt: Raw HTML string.
            chunk_token_num: Maximum number of tokens per chunk.

        Returns:
            A list of text chunk strings.

        Raises:
            TypeError: If txt is not a string.
        """
        if not isinstance(txt, str):
            raise TypeError("txt type should be string!")

        temp_sections = []
        soup = BeautifulSoup(txt, "html5lib")
        # delete <style> tag
        for style_tag in soup.find_all(["style", "script"]):
            style_tag.decompose()
        # delete <script> tag in <div>
        for div_tag in soup.find_all("div"):
            for script_tag in div_tag.find_all("script"):
                script_tag.decompose()
        # delete inline style
        for tag in soup.find_all(True):
            if 'style' in tag.attrs:
                del tag.attrs['style']
        # delete HTML comment
        for comment in soup.find_all(string=lambda text: isinstance(text, Comment)):
            comment.extract()

        # Recursively extract text from the body element
        cls.read_text_recursively(soup.body, temp_sections, chunk_token_num=chunk_token_num)
        # Separate block text from tables
        block_txt_list, table_list = cls.merge_block_text(temp_sections)
        # Chunk the block text
        sections = cls.chunk_block(block_txt_list, chunk_token_num=chunk_token_num)
        # Append table content as separate chunks
        for table in table_list:
            sections.append(table.get("content", ""))
        return sections

    @classmethod
    def split_table(cls, html_table, chunk_token_num=512):
        """Split an HTML table into multiple smaller tables by row count.

        Used when a table exceeds the token limit to break it into
        manageable pieces.

        Args:
            html_table: Raw HTML string of the table.
            chunk_token_num: Maximum tokens per table chunk.

        Returns:
            A list of HTML table strings, each within the token limit.
        """
        soup = BeautifulSoup(html_table, "html.parser")
        rows = soup.find_all("tr")
        tables = []
        current_table = []
        current_count = 0
        table_str_list = []
        for row in rows:
            tks_str = rag_tokenizer.tokenize(str(row))
            token_count = len(tks_str.split(" ")) if tks_str else 0
            if current_count + token_count > chunk_token_num:
                tables.append(current_table)
                current_table = []
                current_count = 0
            current_table.append(row)
            current_count += token_count
        if current_table:
            tables.append(current_table)

        for table_rows in tables:
            new_table = soup.new_tag("table")
            for row in table_rows:
                new_table.append(row)
            table_str_list.append(str(new_table))

        return table_str_list

    @classmethod
    def read_text_recursively(cls, element, parser_result, chunk_token_num=512, parent_name=None, block_id=None):
        """Recursively traverse DOM elements and extract text content.

        Navigable strings are extracted as inline text. Table elements are
        captured whole with their HTML. Block-level elements receive unique
        IDs for later grouping.

        Args:
            element: BeautifulSoup element (Tag or NavigableString) to process.
            parser_result: Accumulator list for extracted content dicts.
            chunk_token_num: Maximum tokens per chunk (for table splitting).
            parent_name: Tag name of the parent element.
            block_id: UUID of the current block-level element for grouping.

        Returns:
            A list of content info dicts extracted from this element.
        """
        if isinstance(element, NavigableString):
            content = element.strip()

            def is_valid_html(content):
                """Check if a string contains valid HTML tags."""
                try:
                    soup = BeautifulSoup(content, "html.parser")
                    return bool(soup.find())
                except Exception:
                    return False

            return_info = []
            if content:
                # If the text itself contains HTML, recurse into it
                if is_valid_html(content):
                    soup = BeautifulSoup(content, "html.parser")
                    child_info = cls.read_text_recursively(soup, parser_result, chunk_token_num, element.name, block_id)
                    parser_result.extend(child_info)
                else:
                    info = {"content": element.strip(), "tag_name": "inner_text", "metadata": {"block_id": block_id}}
                    if parent_name:
                        info["tag_name"] = parent_name
                    return_info.append(info)
            return return_info
        elif isinstance(element, Tag):
            # Tables are captured as complete HTML elements
            if str.lower(element.name) == "table":
                table_info_list = []
                table_id = str(uuid.uuid1())
                table_list = [html.unescape(str(element))]
                for t in table_list:
                    table_info_list.append({"content": t, "tag_name": "table",
                                            "metadata": {"table_id": table_id, "index": table_list.index(t)}})
                return table_info_list
            else:
                # Assign a new block ID for block-level elements
                if str.lower(element.name) in BLOCK_TAGS:
                    block_id = str(uuid.uuid1())
                # Recurse into child elements
                for child in element.children:
                    child_info = cls.read_text_recursively(child, parser_result, chunk_token_num, element.name,
                                                           block_id)
                    parser_result.extend(child_info)
        return []

    @classmethod
    def merge_block_text(cls, parser_result):
        """Merge text segments that belong to the same block-level element.

        Groups inline text by their block_id and separates table elements
        into a separate list.

        Args:
            parser_result: List of content info dicts from read_text_recursively.

        Returns:
            A tuple of (block_content_list, table_info_list):
            - block_content_list: list of merged text strings per block
            - table_info_list: list of table content dicts
        """
        block_content = []
        current_content = ""
        table_info_list = []
        last_block_id = None
        for item in parser_result:
            content = item.get("content")
            tag_name = item.get("tag_name")
            title_flag = tag_name in TITLE_TAGS
            block_id = item.get("metadata", {}).get("block_id")
            if block_id:
                # Prepend heading prefix for title tags
                if title_flag:
                    content = f"{TITLE_TAGS[tag_name]} {content}"
                # Start new block when block_id changes
                if last_block_id != block_id:
                    if last_block_id is not None:
                        block_content.append(current_content)
                    current_content = content
                    last_block_id = block_id
                else:
                    current_content += (" " if current_content else "") + content
            else:
                if tag_name == "table":
                    table_info_list.append(item)
                else:
                    current_content += (" " if current_content else "") + content
        if current_content:
            block_content.append(current_content)
        return block_content, table_info_list

    @classmethod
    def chunk_block(cls, block_txt_list, chunk_token_num=512):
        """Split a list of text blocks into token-limited chunks.

        Blocks that exceed the token limit are split by tokens. Smaller blocks
        are merged together until the limit is reached.

        Args:
            block_txt_list: List of text block strings to chunk.
            chunk_token_num: Maximum number of tokens per chunk.

        Returns:
            A list of chunk strings, each within the token limit.
        """
        chunks = []
        current_block = ""
        current_token_count = 0

        for block in block_txt_list:
            tks_str = rag_tokenizer.tokenize(block)
            block_token_count = len(tks_str.split(" ")) if tks_str else 0
            # If a single block exceeds the limit, split it by tokens
            if block_token_count > chunk_token_num:
                if current_block:
                    chunks.append(current_block)
                start = 0
                tokens = tks_str.split(" ")
                while start < len(tokens):
                    end = start + chunk_token_num
                    split_tokens = tokens[start:end]
                    chunks.append(" ".join(split_tokens))
                    start = end
                current_block = ""
                current_token_count = 0
            else:
                # Merge blocks until token limit is reached
                if current_token_count + block_token_count <= chunk_token_num:
                    current_block += ("\n" if current_block else "") + block
                    current_token_count += block_token_count
                else:
                    chunks.append(current_block)
                    current_block = block
                    current_token_count = block_token_count

        if current_block:
            chunks.append(current_block)

        return chunks
