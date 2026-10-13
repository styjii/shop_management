from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models

from .barcodes import validate_gtin
from .validators import validate_image_extension, validate_image_size


class Category(models.Model):
    name = models.CharField("nom", max_length=100, unique=True)
    description = models.TextField("description", blank=True)

    class Meta:
        verbose_name = "catégorie"
        verbose_name_plural = "catégories"
        ordering = ["name"]

    def __str__(self):
        return self.name


class Supplier(models.Model):
    name = models.CharField("nom", max_length=150, unique=True)
    contact_name = models.CharField("contact", max_length=150, blank=True)
    email = models.EmailField("e-mail", blank=True)
    phone = models.CharField("téléphone", max_length=30, blank=True)
    address = models.TextField("adresse", blank=True)
    notes = models.TextField("notes", blank=True)
    is_active = models.BooleanField("actif", default=True)
    created_at = models.DateTimeField("créé le", auto_now_add=True)

    class Meta:
        verbose_name = "fournisseur"
        verbose_name_plural = "fournisseurs"
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
    barcode = models.CharField(
        "code-barres",
        max_length=13,
        unique=True,
        null=True,
        blank=True,
        validators=[validate_gtin],
    )
    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="products",
        verbose_name="fournisseur habituel",
    )
    image = models.ImageField(
        "image",
        upload_to="products/",
        blank=True,
        null=True,
        validators=[validate_image_size, validate_image_extension],
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
    # IN/OUT must move at least one unit; an ADJ is the counted stock and may be 0
    # (rule enforced by the serializer and by the CheckConstraint below).
    quantity = models.PositiveIntegerField("quantité")
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
        constraints = [
            models.CheckConstraint(
                condition=models.Q(quantity__gte=1) | models.Q(kind="ADJ"),
                name="movement_quantity_positive_unless_adjustment",
            ),
        ]

    def __str__(self):
        return f"{self.Kind(self.kind).label} : {self.quantity} × {self.product}"


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


class PurchaseOrder(models.Model):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Brouillon"
        SENT = "SENT", "Envoyé"
        RECEIVED = "RECEIVED", "Reçu"
        CANCELLED = "CANCELLED", "Annulé"

    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.PROTECT,
        related_name="purchase_orders",
        verbose_name="fournisseur",
    )
    status = models.CharField(
        "statut", max_length=10, choices=Status.choices, default=Status.DRAFT
    )
    expected_date = models.DateField("livraison prévue", null=True, blank=True)
    notes = models.TextField("notes", blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="purchase_orders",
        verbose_name="créé par",
    )
    created_at = models.DateTimeField("créé le", auto_now_add=True)
    received_at = models.DateTimeField("reçu le", null=True, blank=True)

    class Meta:
        verbose_name = "bon de commande"
        verbose_name_plural = "bons de commande"
        ordering = ["-created_at", "-id"]

    @property
    def reference(self):
        return f"BC-{self.pk:05d}"

    @property
    def total(self):
        return sum((line.line_total for line in self.lines.all()), Decimal("0.00"))

    def __str__(self):
        return self.reference


class PurchaseOrderLine(models.Model):
    order = models.ForeignKey(
        PurchaseOrder,
        on_delete=models.CASCADE,
        related_name="lines",
        verbose_name="bon de commande",
    )
    product = models.ForeignKey(
        Product, on_delete=models.PROTECT, verbose_name="produit"
    )
    quantity = models.PositiveIntegerField(
        "quantité", validators=[MinValueValidator(1)]
    )
    unit_cost = models.DecimalField(
        "prix d'achat unitaire",
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.00"))],
    )

    class Meta:
        verbose_name = "ligne de commande"
        verbose_name_plural = "lignes de commande"
        constraints = [
            models.UniqueConstraint(
                fields=["order", "product"], name="purchase_line_unique_product"
            ),
        ]

    @property
    def line_total(self):
        return self.unit_cost * self.quantity

    def __str__(self):
        return f"{self.quantity} × {self.product}"
