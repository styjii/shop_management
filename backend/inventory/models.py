from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models

from .validators import validate_image_size


class Category(models.Model):
    name = models.CharField("nom", max_length=100, unique=True)
    description = models.TextField("description", blank=True)

    class Meta:
        verbose_name = "catégorie"
        verbose_name_plural = "catégories"
        ordering = ["name"]

    def __str__(self):
        return self.name


class Product(models.Model):
    sku = models.CharField("référence (SKU)", max_length=40, unique=True)
    name = models.CharField("nom", max_length=150)
    category = models.ForeignKey(
        Category,
        on_delete=models.PROTECT,
        related_name="products",
        verbose_name="catégorie",
    )
    price = models.DecimalField(
        "prix",
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    quantity = models.PositiveIntegerField("quantité en stock", default=0)
    low_stock_threshold = models.PositiveIntegerField("seuil d'alerte", default=5)
    image = models.ImageField(
        "image",
        upload_to="products/",
        blank=True,
        null=True,
        validators=[validate_image_size],
    )
    is_active = models.BooleanField("en vente", default=True)
    created_at = models.DateTimeField("créé le", auto_now_add=True)
    updated_at = models.DateTimeField("modifié le", auto_now=True)

    class Meta:
        verbose_name = "produit"
        verbose_name_plural = "produits"
        ordering = ["name"]

    @property
    def is_low_stock(self):
        return self.quantity <= self.low_stock_threshold

    def __str__(self):
        return f"{self.sku} - {self.name}"


class StockMovement(models.Model):
    class Kind(models.TextChoices):
        IN = "IN", "Entrée"
        OUT = "OUT", "Sortie"
        ADJ = "ADJ", "Ajustement"

    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name="movements",
        verbose_name="produit",
    )
    kind = models.CharField("type de mouvement", max_length=3, choices=Kind.choices)
    quantity = models.PositiveIntegerField(
        "quantité", validators=[MinValueValidator(1)]
    )
    reason = models.CharField("motif", max_length=200, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="stock_movements",
        verbose_name="enregistré par",
    )
    created_at = models.DateTimeField("date", auto_now_add=True)

    class Meta:
        verbose_name = "mouvement de stock"
        verbose_name_plural = "mouvements de stock"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.get_kind_display()} : {self.quantity} × {self.product}"


class Sale(models.Model):
    seller = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="sales",
        verbose_name="vendeur",
    )
    created_at = models.DateTimeField("date de la vente", auto_now_add=True)
    total = models.DecimalField(
        "total", max_digits=12, decimal_places=2, default=Decimal("0.00")
    )

    class Meta:
        verbose_name = "vente"
        verbose_name_plural = "ventes"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Vente n°{self.pk}"


class SaleItem(models.Model):
    sale = models.ForeignKey(
        Sale,
        on_delete=models.CASCADE,
        related_name="items",
        verbose_name="vente",
    )
    product = models.ForeignKey(
        Product, on_delete=models.PROTECT, verbose_name="produit"
    )
    quantity = models.PositiveIntegerField(
        "quantité", validators=[MinValueValidator(1)]
    )
    unit_price = models.DecimalField("prix unitaire", max_digits=10, decimal_places=2)

    class Meta:
        verbose_name = "ligne de vente"
        verbose_name_plural = "lignes de vente"

    @property
    def line_total(self):
        return self.unit_price * self.quantity

    def __str__(self):
        return f"{self.quantity} × {self.product}"
