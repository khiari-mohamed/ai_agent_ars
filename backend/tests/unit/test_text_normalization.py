from app.services.text_normalization import normalize_for_search


def test_lowercases_and_strips_accents():
    assert normalize_for_search("Déclaration de REMBOURSEMENT") == "declaration de remboursement"


def test_keeps_arabizi_digits():
    assert normalize_for_search("Ena 3andi mochkla fi 9ayd!") == "ena 3andi mochkla fi 9ayd"


def test_strips_arabic_diacritics_and_tatweel():
    assert normalize_for_search("مُشْكِلَـة") == "مشكلة"


def test_collapses_punctuation_and_whitespace():
    assert normalize_for_search("  a,,b ;  c_d \n e ") == "a b c d e"


def test_empty_when_only_punctuation():
    assert normalize_for_search("?!...") == ""