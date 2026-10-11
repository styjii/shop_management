from django.core.exceptions import ValidationError
from django.core.validators import FileExtensionValidator

MAX_IMAGE_SIZE = 2 * 1024 * 1024  # 2 MB

# ImageField already checks with Pillow that the file is a real image; the extension
# whitelist additionally refuses formats such as SVG (which can carry scripts).
validate_image_extension = FileExtensionValidator(["jpg", "jpeg", "png", "webp"])


def validate_image_size(image):
    if image.size > MAX_IMAGE_SIZE:
        raise ValidationError("Image trop lourde (2 Mo maximum).")
