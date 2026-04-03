# ADR-003: API Authentication

Date: 2024-02-20

## Status

Accepted

In the context of securing our REST API, facing the need for stateless
authentication across multiple microservices, we decided to use JWT tokens
with short-lived access tokens and long-lived refresh tokens, to achieve
scalable stateless authentication without requiring a centralized session
store, accepting that token revocation requires additional infrastructure
(token blacklist).

## Additional Notes

The JWT secret key must be rotated quarterly. Access tokens expire after
15 minutes, refresh tokens after 7 days. All tokens use RS256 signing.

## References

- RFC 7519: JSON Web Token
- OWASP JWT Cheat Sheet
