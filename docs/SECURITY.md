# Security notes & checklist

Verified by automated tests (`npm run test:db`, `npm test`, `npm run test:e2e`):
- [x] RLS on all user-facing tables; outsiders cannot read conversations, members, messages, media rows, Moments, saved items, streaks or games
- [x] Cannot spoof `sender_id`, forge notifications/system messages, write XP/streaks/milestones, or edit game state
- [x] Role escalation blocked (self-promotion by table or RPC, admin→admin, demoting the owner, non-owner ownership transfer); single-owner invariant
- [x] Moment audience + expiry enforced in the database; expired Moments invisible even to the author
- [x] Media path ownership, MIME/size constraints, shared-media visibility rules
- [x] Open-redirect protection on `?next=`; magic-byte upload validation; LIKE-wildcard escaping; message flood limit
- [x] Anonymous access to uploads/cron rejected; security headers set
- [x] Service-role key only in `server-only` modules; `.env*` ignored by git

Verified against the live project:
- [x] Storage policies through the real Storage API (private upload + signed URL viewed by the other chat member)
- [x] Realtime `postgres_changes` delivery for messages, read markers, games
- [x] Security Advisor: only intended findings remain; signed-out visitors can call only `username_available`

Still to do before launch:
- [ ] Typing-indicator private channel checked with an outsider account
- [ ] auth rate limits/CAPTCHA configured for sign-up; email confirmation policy decided
- [ ] Penetration test of upload endpoints; CSP header (currently none — add once script sources are final)

Known trade-offs: `username_available` is callable anonymously (reveals username existence, needed for sign-up UX); avatars are in a public bucket by design; read receipts are always on for conversation members.
