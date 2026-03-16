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
"""Visualization utilities for deepdoc detection results.

Provides functions to draw bounding boxes and labels on images for visual
inspection of layout recognition, table structure recognition, and OCR results.
"""

import logging
import os
import PIL
from PIL import ImageDraw


def save_results(image_list, results, labels, output_dir='output/', threshold=0.5):
    """Save detection results as annotated images to disk.

    Args:
        image_list: List of PIL Image objects to annotate.
        results: List of detection result lists, one per image. Each detection
            is a dict with 'type', 'score', and 'bbox' keys.
        labels: List of label names used for color mapping.
        output_dir: Directory path where annotated images will be saved.
        threshold: Minimum score threshold for drawing a detection.
    """
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
    for idx, im in enumerate(image_list):
        im = draw_box(im, results[idx], labels, threshold=threshold)

        out_path = os.path.join(output_dir, f"{idx}.jpg")
        im.save(out_path, quality=95)
        logging.debug("save result to: " + out_path)


def draw_box(im, result, labels, threshold=0.5):
    """Draw bounding boxes and labels on a PIL image.

    Args:
        im: PIL Image object to draw on.
        result: List of detection dicts, each with 'type' (label string),
            'score' (confidence float), and 'bbox' ([x0, y0, x1, y1]).
        labels: List of all possible label names, used for color assignment.
        threshold: Minimum score to include a detection in the drawing.

    Returns:
        The annotated PIL Image with bounding boxes and labels drawn.
    """
    draw_thickness = min(im.size) // 320
    draw = ImageDraw.Draw(im)
    # Generate a unique color for each label
    color_list = get_color_map_list(len(labels))
    clsid2color = {n.lower():color_list[i] for i,n in enumerate(labels)}
    result = [r for r in result if r["score"] >= threshold]

    for dt in result:
        color = tuple(clsid2color[dt["type"]])
        xmin, ymin, xmax, ymax = dt["bbox"]
        # Draw bounding box rectangle
        draw.line(
            [(xmin, ymin), (xmin, ymax), (xmax, ymax), (xmax, ymin),
             (xmin, ymin)],
            width=draw_thickness,
            fill=color)

        # Draw label text with background
        text = "{} {:.4f}".format(dt["type"], dt["score"])
        tw, th = imagedraw_textsize_c(draw, text)
        draw.rectangle(
            [(xmin + 1, ymin - th), (xmin + tw + 1, ymin)], fill=color)
        draw.text((xmin + 1, ymin - th), text, fill=(255, 255, 255))
    return im


def get_color_map_list(num_classes):
    """Generate a list of distinct RGB colors for visualization.

    Uses a bit-interleaving algorithm to produce visually distinct colors
    for up to num_classes categories.

    Args:
        num_classes: Number of distinct colors to generate.

    Returns:
        A list of [R, G, B] integer lists.
    """
    color_map = num_classes * [0, 0, 0]
    for i in range(0, num_classes):
        j = 0
        lab = i
        # Distribute bits of the class index across R, G, B channels
        while lab:
            color_map[i * 3] |= (((lab >> 0) & 1) << (7 - j))
            color_map[i * 3 + 1] |= (((lab >> 1) & 1) << (7 - j))
            color_map[i * 3 + 2] |= (((lab >> 2) & 1) << (7 - j))
            j += 1
            lab >>= 3
    color_map = [color_map[i:i + 3] for i in range(0, len(color_map), 3)]
    return color_map


def imagedraw_textsize_c(draw, text):
    """Get text dimensions compatible with both old and new PIL versions.

    PIL 10+ removed the draw.textsize() method in favor of draw.textbbox().
    This helper abstracts over both APIs.

    Args:
        draw: PIL ImageDraw object.
        text: The text string to measure.

    Returns:
        A (width, height) tuple of the text bounding box.
    """
    if int(PIL.__version__.split('.')[0]) < 10:
        tw, th = draw.textsize(text)
    else:
        left, top, right, bottom = draw.textbbox((0, 0), text)
        tw, th = right - left, bottom - top

    return tw, th
