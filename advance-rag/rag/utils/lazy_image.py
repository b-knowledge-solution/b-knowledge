"""Lazy-loading image wrapper for DOCX embedded images.

Provides a deferred image loading mechanism that concatenates multiple
image blobs from DOCX documents into a single PIL Image only when
the image data is actually needed. This avoids upfront memory allocation
for images that may never be accessed during chunking.

Also provides helper functions for type-checking and safely opening
various image-like objects (PIL Image, LazyDocxImage, raw bytes).
"""

import logging
from io import BytesIO

from PIL import Image

from rag.nlp import concat_img


class LazyDocxImage:
    """Lazily-evaluated composite image from one or more DOCX image blobs.

    Defers decoding and concatenation of image blobs until the image
    is actually accessed (via to_pil(), attribute access, or context manager).
    Multiple blobs are vertically concatenated into a single PIL Image.

    Attributes:
        _blobs: List of raw image byte strings from the DOCX.
        source: Optional source identifier for debugging.
        _pil: Cached PIL Image (lazily created on first access).
    """

    def __init__(self, blobs, source=None):
        self._blobs = [b for b in (blobs or []) if b]
        self.source = source
        self._pil = None

    def __bool__(self):
        """Return True if there are any valid image blobs."""
        return bool(self._blobs)

    def to_pil(self):
        """Decode and concatenate all blobs into a single PIL RGB Image.

        Returns the cached image if available and valid. Otherwise,
        decodes each blob, concatenates them vertically, and caches
        the result.

        Returns:
            PIL Image object, or None if no valid blobs could be decoded.
        """
        if self._pil is not None:
            try:
                self._pil.load()
                return self._pil
            except Exception:
                try:
                    self._pil.close()
                except Exception:
                    pass
                self._pil = None
        res_img = None
        for blob in self._blobs:
            try:
                image = Image.open(BytesIO(blob)).convert("RGB")
            except Exception as e:
                logging.info(f"LazyDocxImage: skip bad image blob: {e}")
                continue

            # Concatenate images vertically as they are decoded
            if res_img is None:
                res_img = image
                continue

            new_img = concat_img(res_img, image)
            if new_img is not res_img:
                try:
                    res_img.close()
                except Exception:
                    pass
            try:
                image.close()
            except Exception:
                pass
            res_img = new_img

        self._pil = res_img
        return self._pil

    def to_pil_detached(self):
        """Return the PIL Image and detach it from this wrapper.

        After calling this method, the wrapper no longer owns the image
        and the caller is responsible for closing it.

        Returns:
            PIL Image object, or None if no valid image.
        """
        pil = self.to_pil()
        self._pil = None
        return pil

    def close(self):
        """Release the cached PIL Image and free its memory.

        Returns:
            None always.
        """
        if self._pil is not None:
            try:
                self._pil.close()
            except Exception:
                pass
            self._pil = None
        return None

    def __getattr__(self, name):
        """Proxy attribute access to the underlying PIL Image.

        Allows transparent use of PIL Image methods (e.g., .size, .mode)
        without explicitly calling to_pil() first.

        Args:
            name: Attribute name to look up on the PIL Image.

        Returns:
            The attribute from the underlying PIL Image.

        Raises:
            AttributeError: If the image is None or lacks the attribute.
        """
        pil = self.to_pil()
        if pil is None:
            raise AttributeError(name)
        return getattr(pil, name)

    def __array__(self, dtype=None):
        """Convert to numpy array for interop with image processing libraries.

        Args:
            dtype: Desired numpy dtype for the output array.

        Returns:
            Numpy array of the image pixels, or empty array if no image.
        """
        import numpy as np

        pil = self.to_pil()
        if pil is None:
            return np.array([], dtype=dtype)
        return np.array(pil, dtype=dtype)

    def __enter__(self):
        """Context manager entry: return the decoded PIL Image."""
        return self.to_pil()

    def __exit__(self, exc_type, exc, tb):
        """Context manager exit: close and release the PIL Image."""
        self.close()
        return False


def ensure_pil_image(img):
    """Convert an image-like object to a PIL Image.

    Args:
        img: A PIL Image, LazyDocxImage, or other object.

    Returns:
        PIL Image object, or None if the input is not image-like.
    """
    if isinstance(img, Image.Image):
        return img
    if isinstance(img, LazyDocxImage):
        return img.to_pil()
    return None


def is_image_like(img):
    """Check whether an object can be treated as an image.

    Args:
        img: Any object to test.

    Returns:
        True if img is a PIL Image or LazyDocxImage.
    """
    return isinstance(img, Image.Image) or isinstance(img, LazyDocxImage)


def open_image_for_processing(img, *, allow_bytes=False):
    """Open an image-like object for processing, with ownership tracking.

    Returns a tuple of (image, close_after) where close_after indicates
    whether the caller is responsible for closing the returned image.

    Args:
        img: A PIL Image, LazyDocxImage, bytes, or other object.
        allow_bytes: If True, attempt to decode raw bytes as an image.

    Returns:
        Tuple of (image_or_original, should_close). For PIL Images
        passed directly, should_close is False. For LazyDocxImage
        or decoded bytes, should_close is True.
    """
    if isinstance(img, Image.Image):
        return img, False
    if isinstance(img, LazyDocxImage):
        return img.to_pil_detached(), True
    if allow_bytes and isinstance(img, (bytes, bytearray)):
        try:
            pil = Image.open(BytesIO(img)).convert("RGB")
            return pil, True
        except Exception as e:
            logging.info(f"open_image_for_processing: bad bytes: {e}")
            return None, False
    return img, False
