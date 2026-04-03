# 1. Record Architecture Decisions

Date: 2024-01-15

## Status

Accepted

## Context

We need to record the architectural decisions made on this project.
Architecture Decision Records (ADRs) provide a lightweight way to document
decisions as they are made, rather than trying to reconstruct them later.

Without a formal record, knowledge about why decisions were made gets lost
as team members rotate. This leads to repeated discussions and sometimes
reversals of good decisions.

## Decision

We will use Architecture Decision Records, as described by Michael Nygard
in his article "Documenting Architecture Decisions". Each ADR will be a
short text file in a specific format stored in the repository.

We will keep ADRs in the `docs/adr` directory and number them sequentially.
Each file will follow the standard Nygard template.

## Consequences

ADRs will be reviewed as part of our code review process. This ensures
the team stays aligned on architectural choices and new members can
quickly understand past decisions.

The format is intentionally lightweight to encourage frequent recording.
If an ADR is superseded, we will mark it as such and reference the new ADR.
