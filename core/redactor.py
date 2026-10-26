from io import BytesIO

from PIL import Image, ImageDraw, ImageOps

from core.models import Finding
from core.validator import validate_image


def redact_image(image: bytes, selected_findings: list[Finding]) -> bytes:
    """Opaque redaction; returns a fresh PNG without EXIF. No disk writes.

    Coordinates refer to the EXIF-oriented image, matching browser Canvas behavior.
    """
    validate_image(image)
    with Image.open(BytesIO(image)) as source:
        oriented = ImageOps.exif_transpose(source)
        output_image = Image.new("RGBA", oriented.size)
        output_image.paste(oriented.convert("RGBA"))
        draw = ImageDraw.Draw(output_image)
        for finding in selected_findings:
            box = finding.box
            if box.x + box.width > output_image.width or box.y + box.height > output_image.height:
                raise ValueError("Redaction box must be inside the image.")
            draw.rectangle((box.x, box.y, box.x + box.width - 1, box.y + box.height - 1), fill=(17, 24, 39, 255))
        result = BytesIO()
        output_image.save(result, format="PNG")
        return result.getvalue()
