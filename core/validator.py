from io import BytesIO
import warnings

from PIL import Image, UnidentifiedImageError

MAX_BYTES = 10 * 1024 * 1024
MAX_PIXELS = 20_000_000
MIME_FORMATS = {"image/png": "PNG", "image/jpeg": "JPEG", "image/webp": "WEBP"}


class ImageValidationError(ValueError):
    pass


def validate_image(image: bytes, content_type: str | None = None) -> tuple[int, int]:
    if not image or len(image) > MAX_BYTES:
        raise ImageValidationError("Image must be non-empty and at most 10 MB.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(image)) as decoded:
                if decoded.format not in MIME_FORMATS.values():
                    raise ImageValidationError("Only PNG, JPEG and WebP are supported.")
                if content_type and MIME_FORMATS.get(content_type) != decoded.format:
                    raise ImageValidationError("Image bytes do not match the declared Content-Type.")
                width, height = decoded.size
                if width * height > MAX_PIXELS:
                    raise ImageValidationError("Image exceeds the 20 megapixel limit.")
                decoded.verify()
                return width, height
    except (UnidentifiedImageError, OSError, SyntaxError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise ImageValidationError("Invalid or unsupported image.") from exc
