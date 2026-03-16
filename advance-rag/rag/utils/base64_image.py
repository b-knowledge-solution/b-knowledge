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
"""Image-to-storage and storage-to-image conversion utilities.

Handles converting chunk images (PIL or LazyDocxImage) to JPEG, uploading
them to object storage (MinIO/S3), and retrieving them back as PIL images.
Used during document chunking to persist images extracted from documents
alongside their text chunks.
"""

import base64
import logging
from functools import partial
from io import BytesIO

from PIL import Image



from common.misc_utils import thread_pool_exec
from rag.utils.lazy_image import open_image_for_processing

# Small transparent PNG used for testing image encoding pipelines
test_image_base64 = "iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAIAAAD/gAIDAAAA6ElEQVR4nO3QwQ3AIBDAsIP9d25XIC+EZE8QZc18w5l9O+AlZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBT+IYAHHLHkdEgAAAABJRU5ErkJggg=="
test_image = base64.b64decode(test_image_base64)


async def image2id(d: dict, storage_put_func: partial, objname: str, bucket: str = "imagetemps"):
    """Convert a chunk's image to JPEG, upload to storage, and replace with an image ID reference.

    Extracts the 'image' field from the chunk dict, converts it to JPEG format,
    uploads the JPEG bytes to object storage, and replaces the 'image' field
    with an 'img_id' reference string of format "bucket-objname".

    Args:
        d: Chunk dictionary containing an 'image' field (PIL Image, LazyDocxImage, or bytes).
        storage_put_func: Partially-applied storage put function for uploading.
        objname: Object name / key for the uploaded image.
        bucket: Storage bucket name for images.
    """
    import logging
    from io import BytesIO
    from rag.svr.task_executor import minio_limiter

    # Skip chunks without images
    if "image" not in d:
        return
    if not d["image"]:
        del d["image"]
        return

    def encode_image():
        """Convert the image to JPEG bytes in a thread-safe manner."""
        with BytesIO() as buf:
            img, close_after = open_image_for_processing(d["image"], allow_bytes=False)

            # If already raw bytes, use as-is
            if isinstance(img, bytes):
                buf.write(img)
                buf.seek(0)
                return buf.getvalue()

            if not isinstance(img, Image.Image):
                return None

            # Convert RGBA/palette images to RGB before saving as JPEG
            if img.mode in ("RGBA", "P"):
                orig_img = img
                img = img.convert("RGB")
                if close_after:
                    try:
                        orig_img.close()
                    except Exception:
                        pass

            try:
                img.save(buf, format="JPEG")
                buf.seek(0)
                return buf.getvalue()
            except OSError as e:
                logging.warning(f"Saving image exception: {e}")
                return None
            finally:
                if close_after:
                    try:
                        img.close()
                    except Exception:
                        pass

    # Encode the image in a background thread to avoid blocking the event loop
    jpeg_binary = await thread_pool_exec(encode_image)
    if jpeg_binary is None:
        del d["image"]
        return

    # Upload JPEG to storage with concurrency limiting
    async with minio_limiter:
        await thread_pool_exec(
            lambda: storage_put_func(bucket=bucket, fnm=objname, binary=jpeg_binary)
        )

    # Replace image data with a storage reference ID
    d["img_id"] = f"{bucket}-{objname}"

    # Clean up the original image object
    if not isinstance(d["image"], bytes):
        d["image"].close()
    del d["image"]


def id2image(image_id: str | None, storage_get_func: partial):
    """Retrieve an image from storage by its image ID.

    Parses the image ID (format "bucket-name") to locate the image
    in object storage and returns it as a PIL Image.

    Args:
        image_id: Image reference string in "bucket-name" format.
        storage_get_func: Partially-applied storage get function for downloading.

    Returns:
        PIL Image object, or None if the image ID is invalid or retrieval fails.
    """
    if not image_id:
        return
    arr = image_id.split("-")
    if len(arr) != 2:
        return
    bkt, nm = image_id.split("-")
    try:
        blob = storage_get_func(bucket=bkt, fnm=nm)
        if not blob:
            return
        return Image.open(BytesIO(blob))
    except Exception as e:
        logging.exception(e)
