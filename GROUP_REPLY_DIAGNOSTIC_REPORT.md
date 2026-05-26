# GROUP_REPLY_DIAGNOSTIC_REPORT

## 1) Current Message Flow (actual runtime path)

1. Baileys receives event: `messages.upsert` in `server/baileys/whatsappClient.js`.
2. Each message is parsed by `parseIncomingMessage(...)` in `server/baileys/messageParser.js`.
3. Parsed message goes to `processInboundMessage(...)` in `server/services/replyEngine.js`.
4. If `parsed.isGroup === true`, flow goes to `handleAdminGroupMessage(...)`.
5. `handleAdminGroupMessage(...)` resolves identity via `resolveIdentityFromParsed(...)` (`server/services/identityService.js`).
6. Group is upserted/updated by `markGroupMessageSeen(...)` (`server/services/adminGroupService.js`).
7. Group permission gate is evaluated by `shouldRespondInGroup(...)`.
8. Router decision is evaluated by `evaluateGroupRouting(...)` (`server/services/groupRouterService.js`).
9. Owner command path is checked first via `executeOwnerCommand(...)` (`server/services/ownerCommandService.js`).
10. If report/command route is valid, response is sent by `whatsappClient.sendMessage(parsed.jid, ...)` (group JID).

## 2) Every place where group messages can be ignored

- `processInboundMessage(...)` early return when `parsed.fromMe` is true.
- Group blocked when `settings.enable_groups` is false (unless owner bypass).
- `handleAdminGroupMessage(...)` skip when participant is detected as bot self (`bot_self_participant`).
- Gate blocked by `shouldRespondInGroup(...)`:
  - group mode disabled
  - group not authorized and random-group replies disabled
  - mention-only restrictions
- Route blocked by `evaluateGroupRouting(...)` (casual/non-directed message).
- Unknown sender path can return authorization message or no sensitive reply.
- Permission checks: `bot.ask_group`, report permission key checks.

## 3) Effective group settings (runtime)

From runtime settings inspection (`getSettings()`):

- `ENABLE_GROUPS = true`
- `ENABLE_ADMIN_GROUP_MODE = true`
- `REPLY_TO_RANDOM_GROUPS = false`
- `REPLY_ONLY_WHEN_MENTIONED = false`
- `OWNER_BYPASS_GROUP_RULES = true`
- `ALLOW_REPORT_COMMANDS_IN_ADMIN_GROUPS = true`

## 4) Effective owner identifiers loaded by runtime

Owner config + seed resolved with these identifiers:

- `0578448146`
- `966578448146`
- `966578448146@s.whatsapp.net`
- `271352091164856`
- `271352091164856@lid`

## 5) Whether owner is seeded in database

Verified: **Yes**.

`/api/debug/owner` shows owner row in `people`, matching `system_owner`, enabled, VIP, and full identifiers inserted in `person_identifiers` with `source=owner_seed`.

## 6) Whether `271352091164856@lid` resolves to owner

Verified: **Yes**.

Simulation and direct resolver tests return:
- `isOwner = true`
- `isSuperAdmin = true`
- role = `system_owner`
- matched identifiers include `271352091164856@lid` and `271352091164856`.

## 7) Whether the target group is enabled

Group `120363427728894752@g.us` exists in `admin_groups` and is enabled in current DB snapshot (verified through simulation payload response).

## 8) Whether Arabic command `من أنا؟` is detected

Before fix: **No** (failed detection).
After fix: **Yes**.

Simulation returns:
- `commandDetected = "who_am_i"`
- `shouldReply = true`
- planned reply includes owner identity and role.

## 9) Whether Arabic command `تقرير اليوم` is detected

Before fix: **No** (failed trigger detection).
After fix: **Yes**.

Simulation returns:
- `commandDetected = "owner_report"`
- `shouldReply = true`
- planned reply contains generated daily report.

## 10) Whether sendMessage uses groupJid or participantJid

Verified in `handleAdminGroupMessage(...)`: replies are sent to **group JID**:

- `whatsappClient.sendMessage(parsed.jid, ...)`

No group reply path sends to participant JID.

## 11) Exact root cause(s)

### Primary root cause (critical)
Arabic command/intent matching in group routing and owner-command services was corrupted by bad text encoding (mojibake), causing command detectors to fail.

Impact:
- `من أنا؟`, `فعّل هذه المجموعة`, `تقرير اليوم` were not recognized reliably.
- Group router treated many admin messages as non-commands/casual paths.

### Secondary root causes
- Missing robust nested message unwrapping (`ephemeral/viewOnce`) previously made text extraction fail for some group messages.
- Lack of high-fidelity group debug traces made diagnosis difficult.

## Fixes applied

1. Rewrote Arabic command detection logic in:
   - `server/services/ownerCommandService.js`
   - `server/services/reportIntentService.js`
   - `server/services/groupRouterService.js`
2. Fixed group parser extraction/unwrapping in `server/baileys/messageParser.js`.
3. Added and wired detailed group debug telemetry:
   - console logs (`=== GROUP MESSAGE DEBUG ===`)
   - DB logs (`source = group_debug`)
   - endpoint `GET /api/debug/group-events`
4. Confirmed owner bypass in group routing for owner/super-admin.
5. Confirmed owner LID mapping path in identity resolver.
6. Added/verified debug endpoints:
   - `POST /api/debug/identity`
   - `GET /api/debug/owner`
   - `GET /api/debug/group-last-skips`
   - `GET /api/debug/group-events`
   - `GET /api/debug/bot-identity`
   - `POST /api/debug/simulate-group-message`
7. Fixed group reply target to remain group JID path.
8. Added admin-groups UI diagnostic action (`تشخيص المجموعة`) using simulate endpoint.

## Validation snapshots performed

- `/api/debug/owner`: owner seeded + identifiers present.
- `/api/debug/simulate-group-message` with owner LID + `من أنا؟`: owner recognized, reply planned.
- `/api/debug/simulate-group-message` with owner LID + `فعّل هذه المجموعة`: command detected `enable_current_group`.
- `/api/debug/simulate-group-message` with owner LID + `تقرير اليوم`: report path detected and response planned.

## Note about live WhatsApp confirmation

Live group reply confirmation (actual phone message round-trip) requires sending real messages from WhatsApp device/group after restart. Backend decision path and simulation path are now passing.
