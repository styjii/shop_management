"""Sales statistics for the charts."""

from datetime import datetime, time, timedelta
from decimal import Decimal

from django.db.models import Count, DecimalField, ExpressionWrapper, F, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone

from .models import SaleItem

MAX_DAYS = 365
ZERO = Decimal("0.00")


def money(value):
    """Amounts are sent as strings with 2 decimals, like the serializers do (no float errors)."""
    return f"{(value or ZERO):.2f}"


LINE_TOTAL = ExpressionWrapper(
    F("quantity") * F("unit_price"), output_field=DecimalField(max_digits=14, decimal_places=2)
)


def sales_stats(sales, days, top=5):
    """Totals, daily series, best products and categories of `sales` over the last `days` days."""
    today = timezone.localdate()
    first_day = today - timedelta(days=days - 1)
    start = timezone.make_aware(datetime.combine(first_day, time.min))
    sales = sales.filter(created_at__gte=start)

    per_day = {
        row["day"]: row
        for row in sales.annotate(day=TruncDate("created_at"))
        .values("day")
        .annotate(revenue=Sum("total"), count=Count("id"))
    }
    daily = []
    for offset in range(days):
        day = first_day + timedelta(days=offset)
        row = per_day.get(day)
        daily.append(
            {
                "date": day.isoformat(),
                "revenue": money(row["revenue"] if row else ZERO),
                "sales_count": row["count"] if row else 0,
            }
        )

    items = SaleItem.objects.filter(sale__in=sales)
    top_products = [
        {
            "product": row["product"],
            "name": row["product__name"],
            "quantity": row["units"],
            "revenue": money(row["revenue"]),
        }
        for row in items.values("product", "product__name")
        .annotate(units=Sum("quantity"), revenue=Sum(LINE_TOTAL))  # not "quantity": it would shadow the field
        .order_by("-revenue", "product__name")[:top]
    ]
    by_category = [
        {"category": row["product__category__name"], "revenue": money(row["revenue"])}
        for row in items.values("product__category__name")
        .annotate(revenue=Sum(LINE_TOTAL))
        .order_by("-revenue", "product__category__name")
    ]

    revenue = sum((Decimal(day["revenue"]) for day in daily), ZERO)
    sales_count = sum(day["sales_count"] for day in daily)
    return {
        "days": days,
        "from": first_day.isoformat(),
        "to": today.isoformat(),
        "totals": {
            "revenue": money(revenue),
            "sales_count": sales_count,
            "items_sold": items.aggregate(total=Sum("quantity"))["total"] or 0,
            "average_basket": money(revenue / sales_count if sales_count else ZERO),
        },
        "daily": daily,
        "top_products": top_products,
        "by_category": by_category,
    }
