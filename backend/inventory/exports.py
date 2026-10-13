"""CSV export helpers (French Excel friendly: `;` separator, UTF-8 with BOM, decimal comma)."""

import csv
from datetime import date, datetime
from decimal import Decimal

from django.http import HttpResponse
from django.utils import timezone

# A cell starting with one of these characters is read as a formula by spreadsheets
# (CSV injection): it is prefixed with an apostrophe so it stays plain text.
FORMULA_TRIGGERS = ("=", "+", "-", "@", "\t", "\r")


def safe_text(value: str) -> str:
    return f"'{value}" if value.startswith(FORMULA_TRIGGERS) else value


def format_cell(value):
    if value is None:
        return ""
    if isinstance(value, bool):
        return "Oui" if value else "Non"
    if isinstance(value, Decimal):
        return f"{value:.2f}".replace(".", ",")
    if isinstance(value, datetime):
        return timezone.localtime(value).strftime("%d/%m/%Y %H:%M")
    if isinstance(value, date):
        return value.strftime("%d/%m/%Y")
    if isinstance(value, int):
        return str(value)
    return safe_text(str(value))


def csv_response(filename, header, rows):
    """Build a downloadable CSV. Texts are neutralised against formula injection."""
    response = HttpResponse(content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    response.write("\ufeff")  # BOM: Excel opens the file as UTF-8
    writer = csv.writer(response, delimiter=";")
    writer.writerow(header)
    for row in rows:
        writer.writerow([format_cell(cell) for cell in row])
    return response


def dated_filename(prefix):
    return f"{prefix}-{timezone.localdate():%Y-%m-%d}.csv"
