import pytest
from mobimoney.fees import FeeCalculator
from mobimoney.exceptions import InvalidAmountError


def test_tiered_fee_selects_correct_bracket():
    calc = FeeCalculator()
    assert calc.calculate("send", 5)["fee"] == 0.10
    assert calc.calculate("send", 50)["fee"] == 0.50
    assert calc.calculate("send", 10000)["fee"] == 15.00


def test_deposit_and_receive_are_free_by_default():
    calc = FeeCalculator()
    assert calc.calculate("deposit", 1000)["fee"] == 0.0
    assert calc.calculate("receive", 1000)["fee"] == 0.0


def test_levy_applies_only_above_threshold_and_to_configured_types():
    calc = FeeCalculator()
    below = calc.calculate("send", 100)
    above = calc.calculate("send", 101)
    assert below["levy"] == 0.0
    assert above["levy"] > 0.0
    # withdraw is not in apply_levy_to by default
    assert calc.calculate("withdraw", 500)["levy"] == 0.0


def test_zero_or_negative_amount_raises():
    calc = FeeCalculator()
    with pytest.raises(InvalidAmountError):
        calc.calculate("send", 0)
    with pytest.raises(InvalidAmountError):
        calc.calculate("send", -5)


def test_custom_schedule_override():
    custom = {
        "send": [(float("inf"), 2.00)],
        "withdraw": [(float("inf"), 1.00)],
        "deposit": [(float("inf"), 0.00)],
        "receive": [(float("inf"), 0.00)],
    }
    calc = FeeCalculator(custom_schedules=custom, levy_rate=0)
    assert calc.calculate("send", 9999)["fee"] == 2.00
    assert calc.calculate("send", 9999)["levy"] == 0.0
