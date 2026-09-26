# mobimoney

A small Python library that simulates mobile money (MoMo) transactions — deposit, withdraw, send, and receive — complete with configurable tiered transaction fees and an optional government transfer levy, modelled on the mobile money experience in Ghana.

> Fee schedules are configurable placeholders, not live rates from any specific telco. Adjust `mobimoney/fees.py` to match whatever fee structure you're studying or building against.

## Features

- **Wallet** class: deposit, withdraw, send, receive, transaction history, printable statement
- **MobileMoneyNetwork**: register multiple wallets and transfer between them in one call
- **FeeCalculator**: tiered fee brackets per transaction type, plus a configurable percentage levy above a threshold
- Custom exceptions: `InsufficientFundsError`, `InvalidAmountError`, `AccountNotFoundError`
- Fully unit tested with `pytest`

## Installation

Clone the repo and install locally:

```bash
git clone https://github.com/<your-username>/mobimoney.git
cd mobimoney
pip install -e .
```

Or install the dev/test dependencies too:

```bash
pip install -e ".[dev]"
```

## Quick start

```python
from mobimoney import Wallet

wallet = Wallet("0244000000", owner_name="Kelvin", opening_balance=200)

wallet.deposit(500)
wallet.send(150, to="0201234567")
wallet.withdraw(100)

print(wallet.statement())
print("Total fees paid:", wallet.total_fees_paid())
```

### Transferring between two wallets on the same network

```python
from mobimoney import MobileMoneyNetwork

network = MobileMoneyNetwork()
alice = network.register("0244111111", "Alice", opening_balance=1000)
bob = network.register("0244222222", "Bob")

send_tx, receive_tx = network.transfer("0244111111", "0244222222", 250)

print(alice.balance, bob.balance)
```

### Customizing fees

```python
from mobimoney import Wallet, FeeCalculator

custom_fees = FeeCalculator(
    custom_schedules={
        "send": [(100, 1.00), (float("inf"), 5.00)],
        "withdraw": [(float("inf"), 2.00)],
        "deposit": [(float("inf"), 0.00)],
        "receive": [(float("inf"), 0.00)],
    },
    levy_rate=0.01,
    levy_free_threshold=100,
)

wallet = Wallet("0244000000", fee_calculator=custom_fees, opening_balance=1000)
```

## Running the tests

```bash
pip install -e ".[dev]"
pytest -v
```

## Project structure

```
mobimoney/
├── mobimoney/
│   ├── __init__.py
│   ├── account.py       # Wallet and MobileMoneyNetwork
│   ├── fees.py           # FeeCalculator and tiered schedules
│   ├── transaction.py    # Transaction record dataclass
│   └── exceptions.py
├── tests/
│   ├── test_account.py
│   └── test_fees.py
├── examples/
│   └── demo.py
├── pyproject.toml
├── README.md
└── .gitignore
```

## License

MIT
