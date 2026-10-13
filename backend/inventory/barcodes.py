"""Barcode helpers: GTIN validation (EAN-8, UPC-A, EAN-13) and in-store code generation."""

from django.core.exceptions import ValidationError

GTIN_LENGTHS = (8, 12, 13)
IN_STORE_PREFIX = "2"  # GS1 reserves the prefixes 20-29 for codes used inside one store


def gtin_check_digit(body: str) -> int:
    """Check digit of a GTIN body (the digits without the last one)."""
    total = sum(int(digit) * (3 if index % 2 == 0 else 1) for index, digit in enumerate(reversed(body)))
    return (10 - total % 10) % 10


def is_valid_gtin(code: str) -> bool:
    return (
        code.isascii()
        and code.isdigit()
        and len(code) in GTIN_LENGTHS
        and gtin_check_digit(code[:-1]) == int(code[-1])
    )


def validate_gtin(value):
    if not is_valid_gtin(value):
        raise ValidationError(
            "Code-barres invalide : 8, 12 ou 13 chiffres avec une clé de contrôle correcte (EAN-8, UPC-A, EAN-13)."
        )


def build_in_store_ean13(number: int) -> str:
    """EAN-13 `2` + 11-digit number + check digit, for products without a manufacturer code."""
    body = f"{IN_STORE_PREFIX}{number:011d}"
    return f"{body}{gtin_check_digit(body)}"
