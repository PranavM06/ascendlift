"""Verifies the identity token an iOS app receives from Sign in with Apple."""

import hashlib
import hmac
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

import jwt
from jwt import PyJWKClient
from jwt.exceptions import PyJWKClientConnectionError

APPLE_ISSUER = "https://appleid.apple.com"
APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys"
APPLE_SIGNING_ALGORITHM = "RS256"
REQUIRED_CLAIMS = ("iss", "aud", "sub", "iat", "exp")
# Apple's clock and ours can disagree slightly; without this a token issued a
# moment "in the future" would be rejected.
CLOCK_SKEW_LEEWAY_SECONDS = 30


class InvalidAppleTokenError(Exception):
    """The token is not a genuine, current Apple token meant for this app."""


class AppleKeysUnavailableError(Exception):
    """Apple's public keys could not be fetched, so nothing can be verified."""


@dataclass(frozen=True)
class AppleIdentity:
    subject: str
    email: str | None


def hash_nonce(raw_nonce: str) -> str:
    """The form in which the app sends its nonce to Apple.

    The app keeps the raw nonce and gives Apple only this hash. Apple copies
    the hash into the token, and the app sends the raw nonce here, which ties
    the token to the sign-in attempt that asked for it.
    """
    return hashlib.sha256(raw_nonce.encode()).hexdigest()


def _nonce_matches(nonce_claim: Any, raw_nonce: str) -> bool:
    return isinstance(nonce_claim, str) and hmac.compare_digest(
        nonce_claim, hash_nonce(raw_nonce)
    )


class AppleTokenVerifier:
    def __init__(self, audiences: Sequence[str], keys: PyJWKClient) -> None:
        self._audiences = tuple(audiences)
        self._keys = keys

    def verify(self, identity_token: str, raw_nonce: str) -> AppleIdentity:
        claims = self._verified_claims(identity_token)
        subject = claims["sub"]
        email = claims.get("email")
        if not subject or not _nonce_matches(claims.get("nonce"), raw_nonce):
            raise InvalidAppleTokenError
        return AppleIdentity(
            subject=subject, email=email if isinstance(email, str) else None
        )

    def _verified_claims(self, identity_token: str) -> dict[str, Any]:
        try:
            signing_key = self._keys.get_signing_key_from_jwt(identity_token)
            claims: dict[str, Any] = jwt.decode(
                identity_token,
                signing_key.key,
                algorithms=[APPLE_SIGNING_ALGORITHM],
                audience=list(self._audiences),
                issuer=APPLE_ISSUER,
                leeway=CLOCK_SKEW_LEEWAY_SECONDS,
                options={"require": list(REQUIRED_CLAIMS)},
            )
        except PyJWKClientConnectionError as exc:
            raise AppleKeysUnavailableError from exc
        except jwt.PyJWTError as exc:
            raise InvalidAppleTokenError from exc
        return claims
