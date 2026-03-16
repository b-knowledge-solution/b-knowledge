"""Vision-based figure/image parser for enhancing document extraction with LLM descriptions.

Provides wrapper functions and a VisionFigureParser class that use vision language
models (IMAGE2TEXT) to generate textual descriptions of figures and images found in
PDF, DOCX, and Excel documents. Descriptions are generated concurrently using a
thread pool for performance.

The module supports optional contextual prompts (surrounding text above/below figures)
to produce more accurate and contextually relevant descriptions.
"""
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
from concurrent.futures import ThreadPoolExecutor, as_completed
import logging

from PIL import Image

from common.constants import LLMType
from db.services.llm_service import LLMBundle
from db.joint_services.tenant_model_service import get_tenant_default_model_by_type
from common.connection_utils import timeout
from rag.app.picture import vision_llm_chunk as picture_vision_llm_chunk
from rag.prompts.generator import vision_llm_figure_describe_prompt, vision_llm_figure_describe_prompt_with_context
from rag.nlp import append_context2table_image4pdf
from rag.utils.lazy_image import ensure_pil_image, open_image_for_processing, is_image_like

def vision_figure_parser_figure_data_wrapper(figures_data_without_positions):
    """Convert raw figure data tuples into the format expected by VisionFigureParser.

    Wraps each (description, image) pair with dummy position coordinates so that
    figures without explicit positions can still be processed.

    Args:
        figures_data_without_positions: List of (description, image_data) tuples.

    Returns:
        List of ((PIL.Image, [description]), [(0,0,0,0,0)]) tuples.
    """
    if not figures_data_without_positions:
        return []
    res = []
    for figure_data in figures_data_without_positions:
        img = ensure_pil_image(figure_data[1])
        if not isinstance(img, Image.Image):
            continue
        res.append(
            (
                (img, [figure_data[0]]),
                [(0, 0, 0, 0, 0)],
            )
        )
    return res

def vision_figure_parser_docx_wrapper(sections, tbls, callback=None, **kwargs):
    """Enhance DOCX figure extraction using a vision language model.

    Args:
        sections: List of figure sections extracted from the DOCX.
        tbls: Existing table/figure results to extend.
        callback: Progress callback function (progress_float, message_str).
        **kwargs: Must include 'tenant_id' for model lookup.

    Returns:
        The extended tbls list with vision-enhanced figure descriptions.
    """
    if not sections:
        return tbls
    try:
        vision_model_config = get_tenant_default_model_by_type(kwargs["tenant_id"], LLMType.IMAGE2TEXT)
        vision_model = LLMBundle(kwargs["tenant_id"], vision_model_config)
        callback(0.7, "Visual model detected. Attempting to enhance figure extraction...")
    except Exception:
        vision_model = None
    if vision_model:
        figures_data = vision_figure_parser_figure_data_wrapper(sections)
        try:
            docx_vision_parser = VisionFigureParser(vision_model=vision_model, figures_data=figures_data, **kwargs)
            boosted_figures = docx_vision_parser(callback=callback)
            tbls.extend(boosted_figures)
        except Exception as e:
            callback(0.8, f"Visual model error: {e}. Skipping figure parsing enhancement.")
    return tbls

def vision_figure_parser_figure_xlsx_wrapper(images, callback=None, **kwargs):
    """Enhance Excel embedded image extraction using a vision language model.

    Args:
        images: List of image dicts with 'image' (PIL.Image) and 'image_description' keys.
        callback: Progress callback function (progress_float, message_str).
        **kwargs: Must include 'tenant_id' for model lookup.

    Returns:
        List of vision-enhanced figure tuples.
    """
    tbls = []
    if not images:
        return []
    try:
        vision_model_config = get_tenant_default_model_by_type(kwargs["tenant_id"], LLMType.IMAGE2TEXT)
        vision_model = LLMBundle(kwargs["tenant_id"], vision_model_config)
        callback(0.2, "Visual model detected. Attempting to enhance Excel image extraction...")
    except Exception:
        vision_model = None
    if vision_model:
        figures_data = [((
                        img["image"],   # Image.Image
                        [img["image_description"]]     # description list (must be list)
                    ),
                    [
                        (0, 0, 0, 0, 0)   # dummy position
                    ]) for img in images]
        try:
            parser = VisionFigureParser(vision_model=vision_model, figures_data=figures_data, **kwargs)
            callback(0.22, "Parsing images...")
            boosted_figures = parser(callback=callback)
            tbls.extend(boosted_figures)
        except Exception as e:
            callback(0.25, f"Excel visual model error: {e}. Skipping vision enhancement.")
    return tbls

def vision_figure_parser_pdf_wrapper(tbls, callback=None, **kwargs):
    """Enhance PDF figure extraction using a vision language model with optional context.

    Identifies figure items in the table results, optionally gathers surrounding text
    context, and generates vision-based descriptions for each figure.

    Args:
        tbls: List of table/figure result tuples from PDF parsing.
        callback: Progress callback function (progress_float, message_str).
        **kwargs: Must include 'tenant_id'; optionally 'sections' and 'parser_config'.

    Returns:
        The updated tbls list with original figures replaced by vision-enhanced versions.
    """
    if not tbls:
        return []
    sections = kwargs.get("sections")
    parser_config = kwargs.get("parser_config", {})
    context_size = max(0, int(parser_config.get("image_context_size", 0) or 0))
    try:
        vision_model_config = get_tenant_default_model_by_type(kwargs["tenant_id"], LLMType.IMAGE2TEXT)
        vision_model = LLMBundle(kwargs["tenant_id"], vision_model_config)
        callback(0.7, "Visual model detected. Attempting to enhance figure extraction...")
    except Exception:
        vision_model = None
    if vision_model:

        def is_figure_item(item):
            return is_image_like(item[0][0]) and isinstance(item[0][1], list)

        figures_data = [item for item in tbls if is_figure_item(item)]
        figure_contexts = []
        if sections and figures_data and context_size > 0:
            figure_contexts = append_context2table_image4pdf(
                sections,
                figures_data,
                context_size,
                return_context=True,
            )
        try:
            docx_vision_parser = VisionFigureParser(
                vision_model=vision_model,
                figures_data=figures_data,
                figure_contexts=figure_contexts,
                context_size=context_size,
                **kwargs,
            )
            boosted_figures = docx_vision_parser(callback=callback)
            tbls = [item for item in tbls if not is_figure_item(item)]
            tbls.extend(boosted_figures)
        except Exception as e:
            callback(0.8, f"Visual model error: {e}. Skipping figure parsing enhancement.")
    return tbls


def vision_figure_parser_docx_wrapper_naive(chunks, idx_lst, callback=None, **kwargs):
    """Enhance specific DOCX chunks (by index) with vision-based figure descriptions.

    A simpler variant that operates on pre-chunked data, processing specific chunk
    indices that contain images. Each image is described using the vision model
    with optional context from surrounding text.

    Args:
        chunks: List of chunk dicts, each potentially containing an 'image' key.
        idx_lst: List of chunk indices to process for figure enhancement.
        callback: Progress callback function (progress_float, message_str).
        **kwargs: Must include 'tenant_id' for model lookup.
    """
    if not chunks:
        return []
    try:
        vision_model_config = get_tenant_default_model_by_type(kwargs["tenant_id"], LLMType.IMAGE2TEXT)
        vision_model = LLMBundle(kwargs["tenant_id"], vision_model_config)
        callback(0.7, "Visual model detected. Attempting to enhance figure extraction...")
    except Exception:
        vision_model = None
    if vision_model:
        @timeout(30, 3)
        def worker(idx, ck):
            img, close_after = open_image_for_processing(ck.get("image"), allow_bytes=True)
            if not isinstance(img, Image.Image):
                return idx, ""
            context_above = ck.get("context_above", "")
            context_below = ck.get("context_below", "")
            if context_above or context_below:
                prompt = vision_llm_figure_describe_prompt_with_context(
                    # context_above + caption if any
                    context_above=ck.get("context_above") + ck.get("text", ""),
                    context_below=ck.get("context_below"),
                )
                logging.info(f"[VisionFigureParser] figure={idx} context_above_len={len(context_above)} context_below_len={len(context_below)} prompt=with_context")
                logging.info(f"[VisionFigureParser] figure={idx} context_above_snippet={context_above[:512]}")
                logging.info(f"[VisionFigureParser] figure={idx} context_below_snippet={context_below[:512]}")
            else:
                prompt = vision_llm_figure_describe_prompt()
                logging.info(f"[VisionFigureParser] figure={idx} context_len=0 prompt=default")

            try:
                description_text = picture_vision_llm_chunk(
                    binary=img,
                    vision_model=vision_model,
                    prompt=prompt,
                    callback=callback,
                )
                return idx, description_text
            finally:
                if close_after and isinstance(img, Image.Image):
                    try:
                        img.close()
                    except Exception:
                        pass

        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = [
                executor.submit(worker, idx, chunks[idx])
                for idx in idx_lst
            ]

            for future in as_completed(futures):
                idx, description = future.result()
                chunks[idx]['text'] += description
    
# Shared thread pool for concurrent vision model inference across parser instances
shared_executor = ThreadPoolExecutor(max_workers=10)


class VisionFigureParser:
    """Generates textual descriptions of document figures using a vision language model.

    Takes a collection of figure images with their existing descriptions and positions,
    invokes a vision LLM to produce rich textual descriptions, and reassembles the
    results with position data intact.
    """

    def __init__(self, vision_model, figures_data, *args, **kwargs):
        """Initialize the vision figure parser.

        Args:
            vision_model: An LLMBundle instance configured for IMAGE2TEXT.
            figures_data: List of figure tuples, each either:
                - ((image, [descriptions]), [(page, x0, x1, top, bottom)]) with positions
                - (image, [descriptions]) without positions
            **kwargs: Optional 'figure_contexts' list and 'context_size' int.
        """
        self.vision_model = vision_model
        self.figure_contexts = kwargs.get("figure_contexts") or []
        self.context_size = max(0, int(kwargs.get("context_size", 0) or 0))
        self._extract_figures_info(figures_data)
        assert len(self.figures) == len(self.descriptions)
        assert not self.positions or (len(self.figures) == len(self.positions))

    def _extract_figures_info(self, figures_data):
        """Parse figure data tuples into separate lists of images, descriptions, and positions.

        Args:
            figures_data: List of figure tuples in either positioned or unpositioned format.
        """
        self.figures = []
        self.descriptions = []
        self.positions = []

        for item in figures_data:
            # position
            if len(item) == 2 and isinstance(item[0], tuple) and len(item[0]) == 2 and isinstance(item[1], list) and isinstance(item[1][0], tuple) and len(item[1][0]) == 5:
                img_desc = item[0]
                img = ensure_pil_image(img_desc[0])
                assert len(img_desc) == 2 and isinstance(img, Image.Image) and isinstance(img_desc[1], list), "Should be (figure, [description])"
                self.figures.append(img)
                self.descriptions.append(img_desc[1])
                self.positions.append(item[1])
            else:
                img = ensure_pil_image(item[0])
                assert len(item) == 2 and isinstance(img, Image.Image) and isinstance(item[1], list), f"Unexpected form of figure data: get {len(item)=}, {item=}"
                self.figures.append(img)
                self.descriptions.append(item[1])

    def _assemble(self):
        """Reassemble figures, descriptions, and positions into output tuples.

        Returns:
            List of assembled tuples ready for downstream processing.
        """
        self.assembled = []
        self.has_positions = len(self.positions) != 0
        for i in range(len(self.figures)):
            figure = self.figures[i]
            desc = self.descriptions[i]
            pos = self.positions[i] if self.has_positions else None

            figure_desc = (figure, desc)

            if pos is not None:
                self.assembled.append((figure_desc, pos))
            else:
                self.assembled.append((figure_desc,))

        return self.assembled

    def __call__(self, **kwargs):
        """Run vision model inference on all figures concurrently.

        Submits each figure to the shared thread pool for vision LLM processing,
        collects results, updates descriptions, and assembles final output.

        Args:
            **kwargs: Optional 'callback' for progress reporting.

        Returns:
            List of assembled figure tuples with vision-enhanced descriptions.
        """
        callback = kwargs.get("callback", lambda prog, msg: None)

        @timeout(30, 3)
        def process(figure_idx, figure_binary):
            context_above = ""
            context_below = ""
            if figure_idx < len(self.figure_contexts):
                context_above, context_below = self.figure_contexts[figure_idx]
            if context_above or context_below:
                prompt = vision_llm_figure_describe_prompt_with_context(
                    context_above=context_above,
                    context_below=context_below,
                )
                logging.info(f"[VisionFigureParser] figure={figure_idx} context_size={self.context_size} context_above_len={len(context_above)} context_below_len={len(context_below)} prompt=with_context")
                logging.info(f"[VisionFigureParser] figure={figure_idx} context_above_snippet={context_above[:512]}")
                logging.info(f"[VisionFigureParser] figure={figure_idx} context_below_snippet={context_below[:512]}")
            else:
                prompt = vision_llm_figure_describe_prompt()
                logging.info(f"[VisionFigureParser] figure={figure_idx} context_size={self.context_size} context_len=0 prompt=default")
            description_text = picture_vision_llm_chunk(
                binary=figure_binary,
                vision_model=self.vision_model,
                prompt=prompt,
                callback=callback,
            )
            return figure_idx, description_text

        futures = []
        for idx, img_binary in enumerate(self.figures or []):
            futures.append(shared_executor.submit(process, idx, img_binary))

        for future in as_completed(futures):
            figure_num, txt = future.result()
            if txt:
                self.descriptions[figure_num] = txt + "\n".join(self.descriptions[figure_num])

        self._assemble()

        return self.assembled
