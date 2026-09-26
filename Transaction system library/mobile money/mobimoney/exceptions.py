"""Custom exceptions for the mobimoney library."""


class MobiMoneyError(Exception):
    """Base exception for all mobimoney errors."""


class InsufficientFundsError(MobiMoneyError):
    """Raised when an account does not have enough balance for a transaction."""

    def __init__(self, available, required):
        self.available = available
        self.required = required
        super().__init__(
            f"Insufficient funds: available GHS {available:.2f}, "
            f"required GHS {required:.2f}"
        )


class InvalidAmountError(MobiMoneyError):
    """Raised when a transaction amount is invalid (zero, negative, or non-numeric)."""


class AccountNotFoundError(MobiMoneyError):
    """Raised when an account/wallet cannot be located by its phone number."""
