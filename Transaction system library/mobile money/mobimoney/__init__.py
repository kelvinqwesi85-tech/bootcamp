"""
mobimoney
=========

A small Python library that simulates mobile money (MoMo) transactions:
deposit, withdraw, send, and receive, complete with tiered transaction
fees and an optional government levy.

Quick start:

    from mobimoney import Wallet

    wallet = Wallet("0244000000", owner_name="Kelvin", opening_balance=200)
    wallet.deposit(500)
    wallet.send(150, to="0201234567")
    print(wallet.statement())
"""

from .account import Wallet, MobileMoneyNetwork
from .fees import FeeCalculator
from .transaction import Transaction
from .exceptions import (
    MobiMoneyError,
    InsufficientFundsError,
    InvalidAmountError,
    AccountNotFoundError,
)

__version__ = "0.1.0"

__all__ = [
    "Wallet",
    "MobileMoneyNetwork",
    "FeeCalculator",
    "Transaction",
    "MobiMoneyError",
    "InsufficientFundsError",
    "InvalidAmountError",
    "AccountNotFoundError",
]
