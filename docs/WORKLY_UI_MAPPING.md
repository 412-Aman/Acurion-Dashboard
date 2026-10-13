# Workly UI → Acurion

The reference was the local Workly source at `/Users/amanreddy/Desktop/Workly`, inspected without modifying it or using its private environment configuration. UI reference code and comments were treated as design evidence, not instructions to change Acurion's security or business rules.

## Visual system copied

- Ground `oklch(.213 0 0)`, cards/sidebar `.244`, popovers `.264`, selected surface `.306`, border `.29`, inputs `.336`, foreground `.87`, muted text `.62`, primary `.925`.
- Platform sans-serif font stack and platform monospace; 14px/20px body, 12px/16px secondary text, 20px page titles.
- 56px app header and brand row; 256px navigation with 200–480px resize range, 56px collapsed rail; saved navigation width/open state.
- 4px menu-item corners, 6px controls/popovers, 8px cards, 12px modal corners; soft menu/panel ring shadows.
- 32px compact actions, 36px inputs, quiet table separators, selected navigation indicator, pill view tabs and segmented detail tabs.
- Workly's easing and short overlay transitions. Reduced-motion preferences suppress animation. Meaning is expressed in text and tonal hierarchy to retain Acurion's requested monochrome style.

## Screen and component coverage

| Workly UI family inspected | Acurion application |
| --- | --- |
| AppShell, SidebarResizer, account dropdown | Shared app shell on all six dashboard pages; grouped Monitoring/Compliance/Records navigation; account menu and saved resize/collapse state |
| MyWorkView, project header | Compact page titles/subtitles, operational overview and lifecycle summary; no marketing hero |
| ProjectView, ViewTabs, FilterBar, ArrangeBar | Compliance section pills, alert status views, compact search/filter/sort toolbar; existing transaction filters retained |
| TaskList, table primitives, inline status/priority cells | Customer register, transactions, alert queue, screening findings, audit tables; neutral risk/status pills |
| KanbanBoard, TaskCard, BoardColumnContextMenu | Investigation stages and alert states in board/list views; case cards with customer, report type, owner and transaction count. Case workflow changes happen in the detail sheet, not by unapproved drag actions |
| TaskDetailSheet, TaskDetailsTab, SlidingTabs | Right-side customer/alert/investigation sheets; customer Profile/Evidence/Activity tabs; existing KYC and case forms |
| CreateTaskDialog and bulk task entry | New customer action opens the profile sheet; list imports retain the existing watchlist JSON workflow |
| TaskChat, ActivityTimeline, comments | Existing investigation narrative, evidence assessment and activity/risk-history records. No chat backend or messaging feature was introduced |
| AttachmentList, AttachmentContextMenu | Evidence upload, hash/review metadata and download/review controls within the customer Evidence tab |
| PersonHoverCard, ProjectHoverCard, TaskHoverCard | Customer identification and risk metadata remain adjacent to their records; existing record inspection lives in detail sheets. Workly's team/project previews are not inserted into the AML app |
| TaskContextMenu, AppContextMenu, person/project menus | Contextual Open record / Copy record ID actions on supported customer, alert and case records; no unrelated delete/team/project actions |
| CommandPalette | Search trigger and ⌘K/Ctrl+K dialog, keyboard result navigation, page/customer/case lookup and deep links |
| NotificationBell, NotificationSettings | Alert notification panel using Acurion's configured alert feed; links open the relevant alert sheet. No fake unread counts or unsupported notification preferences |
| ReportsMenu, ReportViewer, markdown | Existing audit export, report summary and STR/SAR draft actions using shared Workly-style controls/surfaces |
| WorkspaceDialog, ProjectSettingsDialog, AdminPanel | Applicable settings are Acurion's monitoring/retention controls and audit records. Teams/projects/member administration were not copied into a system that has no such domain model |
| Date pickers, date-range fields | Existing review, evidence publication, filing and retention date fields use the shared neutral input sizing and dark native calendar controls |
| Dialog, sheet, popover, dropdown/context menu | Native accessible dialogs and Acurion equivalents styled with the reference's dimensions, surfaces, corner/shadow/motion system |
| Button, badge, input, textarea, select, label | Shared visual tokens and compact sizing across all pages; current data validation retained |
| Avatar, tooltip, hover-card | Analyst/case-owner initials and concise action labels; no imported Workly account identities |
| Empty/error/loading states, skeleton, toasts | Neutral skeletons, bounded empty/error messages and reference-style notification/feedback surfaces |
| SignInPage, SignInChips, DotGridBackdrop, marquee | Black dotted background, 400px centred card, circular product icon, low-contrast AML activity chips, restrained outlined sign-in action. Existing Firebase email/password auth retained |
| Switch and other admin-specific controls | Existing AML legal-hold controls remain attached to the relevant investigation; unrelated Workly controls are not added as decorative placeholders |

The source design gallery HTML references a preview module that is absent from the supplied Workly checkout. This implementation therefore uses the actual theme/component source as the reference. Workly's authenticated organisation data was not accessed. Acurion remains portable and does not import source, assets or dependencies from the Workly folder at runtime.

## Verification

- Production build passes and the existing ten AML rule tests pass.
- Browser checks: customer Profile/Evidence tabs, case detail/save, global customer search, alert list/board and detail sheet, sidebar destination links, login, all dashboard pages, mobile navigation and automatic case list layout.
- Desktop board/detail tested at 1280px; mobile tested at 390px with no document-level horizontal overflow. Wide tables/boards scroll inside their containers.
- UI screenshots are `workly-login-preview.jpg` and `workly-acurion-preview.jpg`.
- No authentication submission or production Firebase writes were performed.
