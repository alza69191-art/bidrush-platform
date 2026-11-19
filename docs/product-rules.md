# BidRush Product Rules

- Freelancers and intermediaries join for free; no subscriptions or listing charges.
- Platform revenue is a clearly disclosed client deposit fee only.
- Admin fee changes must be permission-controlled and audited.
- Server clock is authoritative. Default auction duration is five minutes.
- Every bid must be lower than the current valid best bid and meet the minimum decrement and currency precision.
- Validate auction state and end time transactionally; persist bid and audit event atomically.
- The client chooses the suitable offer; lowest price is not automatically the winner.
- Roles: client, freelancer, moderator, admin. Enforce permissions server-side.
- Passwords must be strongly hashed; session cookies secure, HttpOnly and SameSite.
- Do not claim escrow until a provider contractually supports holding, release, refunds and disputes and is eligible for the operating country.
