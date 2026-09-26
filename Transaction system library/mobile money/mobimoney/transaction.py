"""Transaction record objects."""

from dataclasses import dataclass, field
from datetime import datetime
import uuid


@dataclass
class Transaction:
    """An immutable record of a single mobile money transaction."""

    type: str  # "deposit", "withdraw", "send", "receive"
    amount: float
    fee: float
    levy: float
    balance_after: float
    counterparty: str | None = None  # phone number, if applicable
    timestamp: datetime = field(default_factory=datetime.now)
    reference: str = field(default_factory=lambda: uuid.uuid4().hex[:10].upper())

    @property
    def total_charge(self) -> float:
        return round(self.fee + self.levy, 2)

    def __str__(self) -> str:
        cp = f" -> {self.counterparty}" if self.counterparty else ""
        return (
            f"[{self.timestamp:%Y-%m-%d %H:%M:%S}] {self.type.upper()}{cp} "
            f"GHS {self.amount:.2f} (fee GHS {self.fee:.2f}, levy GHS {self.levy:.2f}) "
            f"| ref {self.reference} | balance GHS {self.balance_after:.2f}"
        )
