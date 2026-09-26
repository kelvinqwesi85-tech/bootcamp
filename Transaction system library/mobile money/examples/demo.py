"""
Run with:  python examples/demo.py
(after `pip install -e .` from the project root)
"""

from mobimoney import Wallet, MobileMoneyNetwork


def single_wallet_demo():
    print("=== Single wallet demo ===")
    wallet = Wallet("0244000000", owner_name="Kelvin", opening_balance=200)
    wallet.deposit(500)
    wallet.send(150, to="0201234567")
    wallet.withdraw(100)
    print(wallet.statement())
    print(f"Total fees paid: GHS {wallet.total_fees_paid():.2f}\n")


def network_demo():
    print("=== Network transfer demo ===")
    network = MobileMoneyNetwork()
    alice = network.register("0244111111", "Alice", opening_balance=1000)
    bob = network.register("0244222222", "Bob")

    send_tx, receive_tx = network.transfer("0244111111", "0244222222", 250)

    print(send_tx)
    print(receive_tx)
    print(f"Alice balance: GHS {alice.balance:.2f}")
    print(f"Bob balance:   GHS {bob.balance:.2f}")


if __name__ == "__main__":
    single_wallet_demo()
    network_demo()
