import pytest
from mobimoney import Wallet, MobileMoneyNetwork, InsufficientFundsError, InvalidAmountError


def test_deposit_increases_balance():
    w = Wallet("0244000000", opening_balance=0)
    w.deposit(100)
    assert w.balance == 100.0  # deposit fee is 0 by default


def test_withdraw_deducts_amount_and_fee():
    w = Wallet("0244000000", opening_balance=200)
    tx = w.withdraw(50)
    assert tx.fee == 0.50
    assert w.balance == round(200 - 50 - 0.50, 2)


def test_withdraw_insufficient_funds_raises():
    w = Wallet("0244000000", opening_balance=10)
    with pytest.raises(InsufficientFundsError):
        w.withdraw(50)


def test_send_deducts_amount_fee_and_levy():
    w = Wallet("0244000000", opening_balance=1000)
    tx = w.send(200, to="0201234567")
    assert tx.counterparty == "0201234567"
    assert tx.levy == round(200 * 0.01, 2)  # above levy-free threshold
    assert w.balance == round(1000 - (200 + tx.fee + tx.levy), 2)


def test_send_below_levy_threshold_has_no_levy():
    w = Wallet("0244000000", opening_balance=1000)
    tx = w.send(50, to="0201234567")  # below default 100 GHS threshold
    assert tx.levy == 0.0


def test_invalid_amount_raises():
    w = Wallet("0244000000", opening_balance=100)
    with pytest.raises(InvalidAmountError):
        w.deposit(-10)
    with pytest.raises(InvalidAmountError):
        w.withdraw(0)


def test_statement_and_total_fees():
    w = Wallet("0244000000", owner_name="Kelvin", opening_balance=500)
    w.deposit(100)
    w.withdraw(50)
    assert "Kelvin" in w.statement()
    assert w.total_fees_paid() > 0


def test_network_transfer_between_two_wallets():
    net = MobileMoneyNetwork()
    alice = net.register("0244111111", "Alice", opening_balance=500)
    bob = net.register("0244222222", "Bob", opening_balance=0)

    send_tx, receive_tx = net.transfer("0244111111", "0244222222", 100)

    assert send_tx.type == "send"
    assert receive_tx.type == "receive"
    assert bob.balance == 100.0  # receive fee is 0 by default
    assert alice.balance == round(500 - (100 + send_tx.fee + send_tx.levy), 2)
