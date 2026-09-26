"""
Fee calculation for mobile money transactions.

Fee tiers are configurable so they can be adjusted to match whatever
schedule you're modelling (they are NOT hard-coded to any single real
telco's current published rates, since those change over time).

Each transaction type has its own tiered schedule: a list of
(upper_bound, fee) tuples, checked in ascending order. The last tuple
should use float('inf') as its upper bound to act as a catch-all.
"""

from .exceptions import InvalidAmountError

# Default tiered fee schedules, modelled loosely on a typical Ghanaian
# mobile money fee structure. Amounts are in GHS. Feel free to override
# via FeeCalculator(custom_schedules=...).
DEFAULT_SCHEDULES = {
    "send": [
        (10, 0.10),
        (100, 0.50),
        (500, 1.50),
        (1000, 3.00),
        (2500, 6.00),
        (5000, 10.00),
        (float("inf"), 15.00),
    ],
    "withdraw": [
        (50, 0.50),
        (100, 1.00),
        (500, 4.00),
        (1000, 7.50),
        (2500, 15.00),
        (5000, 25.00),
        (float("inf"), 35.00),
    ],
    # Cash-in (deposit) is typically free at agents in most schemes.
    "deposit": [
        (float("inf"), 0.00),
    ],
    # Receiving money is typically free for the recipient.
    "receive": [
        (float("inf"), 0.00),
    ],
}

# E-levy style government transfer levy, applied on top of the
# transaction fee for "send" transactions above a daily-cumulative
# threshold in many real-world schemes. Modelled here as a flat
# percentage for simplicity; set to 0 to disable.
DEFAULT_LEVY_RATE = 0.01  # 1%
DEFAULT_LEVY_FREE_THRESHOLD = 100.00  # GHS, per-transaction, illustrative


class FeeCalculator:
    """Calculates transaction fees using configurable tiered schedules."""

    def __init__(
        self,
        custom_schedules: dict | None = None,
        levy_rate: float = DEFAULT_LEVY_RATE,
        levy_free_threshold: float = DEFAULT_LEVY_FREE_THRESHOLD,
        apply_levy_to: tuple = ("send",),
    ):
        self.schedules = custom_schedules or DEFAULT_SCHEDULES
        self.levy_rate = levy_rate
        self.levy_free_threshold = levy_free_threshold
        self.apply_levy_to = apply_levy_to

    def _tiered_fee(self, transaction_type: str, amount: float) -> float:
        schedule = self.schedules.get(transaction_type)
        if schedule is None:
            raise InvalidAmountError(
                f"No fee schedule configured for transaction type '{transaction_type}'"
            )
        for upper_bound, fee in schedule:
            if amount <= upper_bound:
                return fee
        return schedule[-1][1]

    def _levy(self, transaction_type: str, amount: float) -> float:
        if transaction_type not in self.apply_levy_to:
            return 0.0
        if amount <= self.levy_free_threshold:
            return 0.0
        return round(amount * self.levy_rate, 2)

    def calculate(self, transaction_type: str, amount: float) -> dict:
        """
        Returns a breakdown dict:
            {
                "fee": <transaction fee>,
                "levy": <government levy, if any>,
                "total_charge": <fee + levy>,
                "total_debit": <amount + total_charge, for outgoing types>
            }
        """
        if amount <= 0:
            raise InvalidAmountError("Amount must be greater than zero")

        fee = round(self._tiered_fee(transaction_type, amount), 2)
        levy = self._levy(transaction_type, amount)
        total_charge = round(fee + levy, 2)

        return {
            "fee": fee,
            "levy": levy,
            "total_charge": total_charge,
            "total_debit": round(amount + total_charge, 2),
        }
