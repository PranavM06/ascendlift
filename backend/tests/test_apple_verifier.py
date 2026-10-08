import base64
import json
from typing import Any

import pytest

from app.auth.apple import (
    AppleIdentity,
    AppleKeysUnavailableError,
    AppleTokenVerifier,
    InvalidAppleTokenError,
)
from tests.support import (
    APPLE_KEY_ID,
    RAW_NONCE,
    TEST_APPLE_AUDIENCE,
    AppleTokenMinter,
    FakeAppleKeys,
    UnreachableAppleKeys,
    generate_rsa_key,
    jwks_for,
)


def unsigned_token(claims: dict[str, Any]) -> str:
    def encode(part: dict[str, Any]) -> str:
        raw = json.dumps(part).encode()
        return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()

    header = {"alg": "none", "typ": "JWT", "kid": APPLE_KEY_ID}
    return f"{encode(header)}.{encode(claims)}."


def test_valid_token_returns_the_apple_subject_and_email(
    apple_verifier: AppleTokenVerifier, apple_tokens: AppleTokenMinter
) -> None:
    # Arrange
    token = apple_tokens.mint(subject="001234.abc", email="lifter@example.com")

    # Act
    identity = apple_verifier.verify(token, RAW_NONCE)

    # Assert
    assert identity == AppleIdentity(subject="001234.abc", email="lifter@example.com")


def test_token_without_an_email_is_accepted(
    apple_verifier: AppleTokenVerifier, apple_tokens: AppleTokenMinter
) -> None:
    # Arrange
    token = apple_tokens.mint(email=None)

    # Act
    identity = apple_verifier.verify(token, RAW_NONCE)

    # Assert
    assert identity.email is None


def test_token_issued_by_a_clock_slightly_ahead_of_ours_is_accepted(
    apple_verifier: AppleTokenVerifier, apple_tokens: AppleTokenMinter
) -> None:
    # Arrange
    token = apple_tokens.mint(issued_seconds_from_now=20)

    # Act
    identity = apple_verifier.verify(token, RAW_NONCE)

    # Assert
    assert identity.subject == "apple-user-1"


@pytest.mark.parametrize(
    "claim_overrides",
    [
        pytest.param({"issued_seconds_from_now": 600}, id="issued-in-the-future"),
        pytest.param({"audience": "com.someone.else"}, id="wrong-audience"),
        pytest.param({"issuer": "https://evil.example"}, id="wrong-issuer"),
        pytest.param({"expires_in_seconds": -60}, id="expired"),
        pytest.param({"raw_nonce": "a-different-nonce-value"}, id="wrong-nonce"),
        pytest.param({"raw_nonce": None}, id="missing-nonce"),
        pytest.param({"subject": ""}, id="empty-subject"),
    ],
)
def test_token_with_a_bad_claim_is_rejected(
    apple_verifier: AppleTokenVerifier,
    apple_tokens: AppleTokenMinter,
    claim_overrides: dict[str, Any],
) -> None:
    # Arrange
    token = apple_tokens.mint(**claim_overrides)

    # Act / Assert
    with pytest.raises(InvalidAppleTokenError):
        apple_verifier.verify(token, RAW_NONCE)


def test_token_signed_with_another_key_is_rejected(
    apple_verifier: AppleTokenVerifier, apple_tokens: AppleTokenMinter
) -> None:
    # Arrange
    token = apple_tokens.mint(signing_key=generate_rsa_key())

    # Act / Assert
    with pytest.raises(InvalidAppleTokenError):
        apple_verifier.verify(token, RAW_NONCE)


def test_unsigned_token_is_rejected(
    apple_verifier: AppleTokenVerifier, apple_tokens: AppleTokenMinter
) -> None:
    # Arrange
    token = unsigned_token(apple_tokens.claims())

    # Act / Assert
    with pytest.raises(InvalidAppleTokenError):
        apple_verifier.verify(token, RAW_NONCE)


def test_malformed_token_is_rejected(apple_verifier: AppleTokenVerifier) -> None:
    # Act / Assert
    with pytest.raises(InvalidAppleTokenError):
        apple_verifier.verify("not-a-jwt", RAW_NONCE)


def test_token_naming_a_key_apple_does_not_publish_is_rejected(
    apple_tokens: AppleTokenMinter,
) -> None:
    # Arrange
    other_keys = FakeAppleKeys(jwks_for(generate_rsa_key(), key_id="some-other-key"))
    verifier = AppleTokenVerifier(audiences=(TEST_APPLE_AUDIENCE,), keys=other_keys)

    # Act / Assert
    with pytest.raises(InvalidAppleTokenError):
        verifier.verify(apple_tokens.mint(), RAW_NONCE)


def test_unreachable_apple_keys_are_reported_as_unavailable_not_invalid(
    apple_tokens: AppleTokenMinter,
) -> None:
    # Arrange
    verifier = AppleTokenVerifier(
        audiences=(TEST_APPLE_AUDIENCE,), keys=UnreachableAppleKeys()
    )

    # Act / Assert
    with pytest.raises(AppleKeysUnavailableError):
        verifier.verify(apple_tokens.mint(), RAW_NONCE)
