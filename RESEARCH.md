# SideQuest: retention and organic sharing

Research date: September 16, 2026. Scope: focus timers, gamified productivity, and personal task/project tools. These are three established comparators with substantial vendor-reported adoption, not a verified market-share ranking. Downloads, registrations, and active users are different measures.

| Product and evidence | Observable mechanism | SideQuest application |
| --- | --- | --- |
| [Forest](https://www.forestapp.cc/) reports 60M+ downloads and a 4.8 App Store rating. | Completed focus sessions become a lasting visual collection. Group focus gives friends a reason to participate. | A seven-day trail makes completed steps visible. Progress comes from real project steps; a timer is still a means to that end. |
| [Habitica](https://habitica.com/static/home) reports over 4 million participants. | Real tasks yield levels and unlocks; quests with friends connect individual effort with social participation. | Permanent milestones at 1, 5, 20, and 50 steps. A completion receipt makes each win tangible and offers an optional way to pass on the step. |
| [Todoist](https://www.todoist.com/pricing/) reports 30 million+ people using the product. Its [Karma documentation](https://www.todoist.com/help/todoist/features/introduction-to-karma-OgWkWy) describes progress feedback and days off/vacation protection; its [projects guide](https://www.todoist.com/help/todoist/features/introduction-to-projects-TLTjNftLM) describes invitations and templates. | Progress feedback encourages return visits; sharing useful work creates a practical entry point for someone new. | Aim for a finished step on any three of the last seven days, with rest days explicitly welcome. Share an editable quest recipe that recipients can review and save. |

## What the evidence does and does not show

The product features and adoption claims are documented. Their effect on retention, acquisition, or marketing spend is not established by those pages. It would be misleading to say these products grew without marketing or that copying the mechanics guarantees virality. The mechanism below is a product hypothesis to test with SideQuest users.

The proposed loop: choose a small action → finish real work → see accumulating progress → return to the next action already saved → optionally share a useful quest → a recipient makes it their own and reaches a first win.

## Implemented scope

- Seven local calendar days of activity, one mark per active day; multiple steps increase the step total without inflating the active-day count.
- A suggested three-day rhythm, without streak resets, countdown pressure, penalties, or rewards for time spent browsing the app.
- Four lasting milestones derived from existing wins, including old backups. No data migration required.
- A completion receipt with the actual finished action and next-session context. Done is prominent; sharing is optional.
- A copyable win message. Quest name and action are excluded by default and included only after opt-in. No income, context notes, or blockers are included.
- Editable quest links containing only title, action, time estimate, and category. Unicode supported. Recipients preview and edit before saving a separate copy; there is no shared state or team-sync claim.
- Malformed or oversized links are rejected. Values are rendered as text or HTML-escaped. The link payload is a URL fragment, not a server query; anyone receiving the link can decode it. It is not encryption or access control.
- Existing private site audience retained. A copied link cannot grant access. Organic acquisition cannot be tested with outside recipients until the owner explicitly authorizes broader access.

## Deliberately deferred

Live co-working rooms, group progress, referral rewards, accounts, and public community feeds require identity, durable storage, moderation, or incentive-abuse controls. They are not simulated in this browser-local MVP. Push notifications and artificial urgency are unnecessary for this slice.

## Validation and next experiment

Automated checks cover local dates (including month/year and DST boundaries), permanent milestones, safe link fields, malformed payloads, Unicode, privacy defaults, and the existing backup/completed-quest flows. Browser checks exercise copying, recipient preview/cancel/save, completion feedback, next-action retention, and responsive layouts.

Before another feature expansion, recruit a small explicitly invited test group once access is approved. Observe whether people finish a first step, return to another step within seven days, and voluntarily share a quest that someone else completes. Record counts and denominators; do not equate copying a link with a referral. Ask whether the progress trail feels motivating or burdensome. Compare returning completion behavior with the earlier version over a longer pilot before making retention claims. No tracking service or transmission of users' quest content was added in this release.
