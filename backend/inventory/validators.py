from django.core.exceptions import ValidationError

MAX_IMAGE_SIZE = 2 * 1024 * 1024  # 2 MB


def validate_image_size(image):
    if image.size > MAX_IMAGE_SIZE:
        raise ValidationError("Image trop lourde (2 Mo maximum).")
