"""Wallet/account simulation for mobile money."""

from .exceptions import InsufficientFundsError, InvalidAmountError
from .fees import FeeCalculator
from .transaction import Transaction


class Wallet:
    """
    Simulates a single mobile money wallet/account.

    Example:
        >>> wallet = Wallet("0244000000", owner_name="Kelvin")
        >>> wallet.deposit(500)
        >>> wallet.send(100, to="0201234567")
        >>> wallet.balance
        396.5
    """

    def __init__(
        self,
        phone_number: str,
        owner_name: str = "",
        opening_balance: float = 0.0,
        fee_calculator: FeeCalculator | None = None,
    ):
        self.phone_number = phone_number
        self.owner_name = owner_name
        self.balance = round(opening_balance, 2)
        self.fee_calculator = fee_calculator or FeeCalculator()
        self.history: list[Transaction] = []

    # -- internal helpers ---------------------------------------------

    def _record(self, tx_type, amount, fee, levy, counterparty=None) -> Transaction:
        tx = Transaction(
            type=tx_type,
            amount=round(amount, 2),
            fee=fee,
            levy=levy,
            balance_after=self.balance,
            counterparty=counterparty,
        )
        self.history.append(tx)
        return tx

    @staticmethod
    def _validate_amount(amount):
        if not isinstance(amount, (int, float)) or amount <= 0:
            raise InvalidAmountError("Amount must be a positive number")

    # -- public operations ----------------------------------------------

    def deposit(self, amount: float) -> Transaction:
        """Cash-in: add money to the wallet (agent deposit)."""
        self._validate_amount(amount)
        breakdown = self.fee_calculator.calculate("deposit", amount)
        self.balance = round(self.balance + amount - breakdown["total_charge"], 2)
        return self._record("deposit", amount, breakdown["fee"], breakdown["levy"])

    def withdraw(self, amount: float) -> Transaction:
        """Cash-out: withdraw money from the wallet at an agent/ATM."""
        self._validate_amount(amount)
        breakdown = self.fee_calculator.calculate("withdraw", amount)
        total_debit = breakdown["total_debit"]
        if total_debit > self.balance:
            raise InsufficientFundsError(self.balance, total_debit)
        self.balance = round(self.balance - total_debit, 2)
        return self._record("withdraw", amount, breakdown["fee"], breakdown["levy"])

    def send(self, amount: float, to: str) -> Transaction:
        """Send (P2P transfer) money to another wallet's phone number."""
        self._validate_amount(amount)
        breakdown = self.fee_calculator.calculate("send", amount)
        total_debit = breakdown["total_debit"]
        if total_debit > self.balance:
            raise InsufficientFundsError(self.balance, total_debit)
        self.balance = round(self.balance - total_debit, 2)
        return self._record("send", amount, breakdown["fee"], breakdown["levy"], counterparty=to)

    def receive(self, amount: float, from_: str) -> Transaction:
        """Receive money sent from another wallet's phone number."""
        self._validate_amount(amount)
        breakdown = self.fee_calculator.calculate("receive", amount)
        self.balance = round(self.balance + amount - breakdown["total_charge"], 2)
        return self._record("receive", amount, breakdown["fee"], breakdown["levy"], counterparty=from_)

    # -- reporting -------------------------------------------------------

    def statement(self) -> str:
        """Return a printable mini bank-statement of all transactions."""
        lines = [f"Statement for {self.owner_name or self.phone_number} ({self.phone_number})"]
        lines.append("-" * 60)
        for tx in self.history:
            lines.append(str(tx))
        lines.append("-" * 60)
        lines.append(f"Current balance: GHS {self.balance:.2f}")
        return "\n".join(lines)

    def total_fees_paid(self) -> float:
        return round(sum(tx.total_charge for tx in self.history), 2)

    def __repr__(self):
        return f"Wallet(phone_number={self.phone_number!r}, balance={self.balance:.2f})"


class MobileMoneyNetwork:
    """
    Optional convenience layer that manages multiple wallets, so a
    'send' from one wallet automatically credits the other with
    receive() applied on the recipient's side.
    """

    def __init__(self, fee_calculator: FeeCalculator | None = None):
        self.fee_calculator = fee_calculator or FeeCalculator()
        self._wallets: dict[str, Wallet] = {}

    def register(self, phone_number: str, owner_name: str = "", opening_balance: float = 0.0) -> Wallet:
        wallet = Wallet(phone_number, owner_name, opening_balance, self.fee_calculator)
        self._wallets[phone_number] = wallet
        return wallet

    def get(self, phone_number: str) -> Wallet:
        from .exceptions import AccountNotFoundError

        wallet = self._wallets.get(phone_number)
        if wallet is None:
            raise AccountNotFoundError(f"No wallet registered for {phone_number}")
        return wallet

    def transfer(self, from_number: str, to_number: str, amount: float):
        """Send from one registered wallet and credit the other, in one call."""
        sender = self.get(from_number)
        recipient = self.get(to_number)
        send_tx = sender.send(amount, to=to_number)
        receive_tx = recipient.receive(amount, from_=from_number)
        return send_tx, receive_tx
