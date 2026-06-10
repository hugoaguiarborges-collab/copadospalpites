# Security Specification - Copa dos Palpites

This document defines the security boundaries, data invariants, and verification strategies to guarantee the absolute secrecy of sport guesses until a round is closed.

## 1. Data Invariants

1. **Absolute Secrecy**: No palpite (guess) document can be read by anyone (including admins) while its corresponding round status is "aberta" (open) and before the closing timestamp has passed.
2. **Read Access After Closing**: A palpite can only be queried/read when the round status is "encerrada" (closed) or the current timestamp is greater than the round's `fechamento` timestamp.
3. **No Retroactive Guessing**: No palpite can be created or modified if the round's status is "encerrada" or if the current timestamp equals or exceeds the round's `fechamento` timestamp.
4. **Authenticity of Submissions**: Guess records must contain a valid participant name, corresponding round, guess details, and captain selection.
5. **Score Adjustments Integrity**: Only authorized administrators can record score adjustments or update participants' points.

## 2. Threat Models & Test Payloads ("The Dirty Dozen")

The following payloads represent malicious actions that must yield `PERMISSION_DENIED` at the Firestore database level:

1. **Unpermitted Read (Open Round)**: Attempting to query or read guesses for Round 1 while it is still open and before the closing time.
2. **Admin Eavesdropping**: Admin attempts to fetch a participant's guess before market closing.
3. **Late Submission**: Submitting a guess payload after the round's `fechamento` timestamp.
4. **Anarchy Score Update**: A regular user writing directly to a participant's `pontos` field.
5. **Unauthorized Round Alteration**: Changing round dates or status directly of a round document.
6. **Spoofed Name Submission**: Regular user attempting to modify another user's submitted guesses.
7. **Junk String ID Pollution**: Injected 1MB characters or path traversal strings on `palpiteId` or `participanteId` blocks.
8. **Negative Point Alteration**: Regular user creating fake negative or massive positive adjustment records in `pontuacoes` collection.
9. **Duplicate Round Window Theft**: Creating a round document with invalid status or overlapping times to cheat.
10. **Shadow Key Inject**: Creating a palpite with a ghost field `is_winner: true` bypass.
11. **Timestamp Spoof**: Creating a palpite with a user-defined past `data_hora_envio` to bypass the delay.
12. **Self-Admin Promotion**: Creating an admin entry in `/admins` collection to hijack the system.
