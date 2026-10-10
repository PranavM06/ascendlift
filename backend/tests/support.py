"""Helpers shared by the API tests: a fake Apple key server and token minter."""

import time
from dataclasses import dataclass
from typing import Any

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from jwt import PyJWKClient
from jwt.exceptions import PyJWKClientConnectionError

from app.auth.apple import APPLE_ISSUER, hash_nonce

TEST_APPLE_AUDIENCE = "host.exp.Exponent"
APPLE_KEY_ID = "test-key-1"
RAW_NONCE = "raw-nonce-0123456789abcdef"
DEFAULT_TOKEN_LIFETIME_SECONDS = 600


def generate_rsa_key() -> rsa.RSAPrivateKey:
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


def jwks_for(
    private_key: rsa.RSAPrivateKey, key_id: str = APPLE_KEY_ID
) -> dict[str, Any]:
    public_jwk = jwt.algorithms.RSAAlgorithm.to_jwk(
        private_key.public_key(), as_dict=True
    )
    return {"keys": [{**public_jwk, "kid": key_id, "use": "sig", "alg": "RS256"}]}


class FakeAppleKeys(PyJWKClient):
    """Serves a fixed key set instead of fetching Apple's over the network."""

    def __init__(self, jwks: dict[str, Any]) -> None:
        super().__init__("https://apple-keys.invalid/auth/keys")
        self._jwks = jwks

    def fetch_data(self) -> Any:
        return self._jwks


class UnreachableAppleKeys(PyJWKClient):
    def __init__(self) -> None:
        super().__init__("https://apple-keys.invalid/auth/keys")

    def fetch_data(self) -> Any:
        raise PyJWKClientConnectionError("connection refused")


@dataclass(frozen=True)
class AppleTokenMinter:
    """Signs identity tokens the way Apple would, with a throwaway key."""

    private_key: rsa.RSAPrivateKey

    def claims(
        self,
        *,
        subject: str = "apple-user-1",
        email: str | None = "lifter@example.com",
        raw_nonce: str | None = RAW_NONCE,
        audience: str = TEST_APPLE_AUDIENCE,
        issuer: str = APPLE_ISSUER,
        expires_in_seconds: int = DEFAULT_TOKEN_LIFETIME_SECONDS,
        issued_seconds_from_now: int = 0,
    ) -> dict[str, Any]:
        issued_at = int(time.time()) + issued_seconds_from_now
        required = {
            "iss": issuer,
            "aud": audience,
            "sub": subject,
            "iat": issued_at,
            "exp": issued_at + expires_in_seconds,
        }
        optional = {
            "email": email,
            "nonce": hash_nonce(raw_nonce) if raw_nonce is not None else None,
        }
        present = {name: value for name, value in optional.items() if value is not None}
        return {**required, **present}

    def mint(
        self, *, signing_key: rsa.RSAPrivateKey | None = None, **claim_overrides: Any
    ) -> str:
        return jwt.encode(
            self.claims(**claim_overrides),
            signing_key or self.private_key,
            algorithm="RS256",
            headers={"kid": APPLE_KEY_ID},
        )


def sign_in(
    client: TestClient,
    apple_tokens: AppleTokenMinter,
    *,
    name: str | None = None,
    **claim_overrides: Any,
) -> dict[str, Any]:
    """Sign in through the API and return the token pair."""
    body = {"identity_token": apple_tokens.mint(**claim_overrides), "nonce": RAW_NONCE}
    response = client.post("/auth/apple", json={**body, "name": name})
    assert response.status_code == 200, response.text
    token_pair: dict[str, Any] = response.json()["data"]
    return token_pair


def bearer(access_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {access_token}"}


def sign_in_as(
    client: TestClient, apple_tokens: AppleTokenMinter, subject: str
) -> dict[str, str]:
    """Sign in as the Apple account `subject` and return its bearer headers."""
    pair = sign_in(client, apple_tokens, subject=subject, email=None)
    return bearer(pair["access_token"])
