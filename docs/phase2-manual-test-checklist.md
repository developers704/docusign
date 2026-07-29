# Phase 2 Manual Test Checklist

## Workflow and Recipients
- Create envelope with 6+ recipients; verify save works and list remains usable.
- Verify sequential: only step 1 recipient is active and emailed.
- Verify parallel: all action recipients in step 1 are active and emailed.
- Verify grouped: recipients in same step work in parallel; next step waits.
- Verify optional recipients do not block completion.

## Runtime Authorization
- Verify recipient can view only assigned pages when page assignments exist.
- Verify sender-only and internal-only pages are blocked for public signer links.
- Verify signer cannot submit fields assigned to another recipient.
- Verify future-step fields are rejected while inactive.

## Expiration and Compatibility
- Verify new envelopes default to no expiration.
- Verify legacy envelopes with expiration still show historical value.
- Verify existing sequential envelope still signs in order.

## Token and OTP Security
- Verify new recipient records do not persist plain signing token.
- Verify resend/reminder rotates token and old link fails.
- Verify OTP resend cooldown blocks rapid resend.
- Verify OTP lockout after max attempts.

## Audit and Email
- Verify workflow and invitation audit events are recorded.
- Verify invitation failures do not leak secrets.
- Verify completion email goes to `receives_copy` recipients when configured.

