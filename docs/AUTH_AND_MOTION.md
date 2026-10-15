# Authentication and motion

## Implemented pages

- `login.html`: email/password, Google and GitHub sign-in; explicit fictional demo entry.
- `signup.html`: optional email registration, name, password confirmation and verification email.
- `forgot-password.html`: recovery email request with a response that does not disclose account existence.
- `verify-email.html`: resend verification, refresh verified status and change account.
- `auth-action.html`: custom password-reset and verification email action handler. Email verification requires an explicit confirmation button; merely opening the page does not consume the action code.

The Firebase SDK performs these operations. No mock authentication success is displayed. Popup cancellation, disabled providers, network failures, invalid credentials and expired links have readable error states. The frontend registration/reset minimum is 12 characters; the Firebase project's password policy should enforce the institution's actual requirements.

## Authentication activation

The existing `acurion-2bd21` web configuration is built in. Email sign-in and registration are enabled by default, matching the team's request to use Email/Password in that project. Set `VITE_AUTH_ENABLED=false` only to pause client auth actions, or `VITE_AUTH_SIGNUP_ENABLED=false` to disable client registration. Existing environment files with the old false values must be updated and the site rebuilt. Social-provider flags still default to false. **Explore demo workspace** remains available for fictional records.

To use the existing project or connect a replacement:

1. Keep the built-in configuration for `acurion-2bd21`, or fill a replacement project's complete public web-app configuration in `.env.local` as described in [Firebase setup](FIREBASE_SETUP.md).
2. Enable Email/Password in Firebase Authentication. Set `VITE_AUTH_ENABLED=true` and `VITE_AUTH_SIGNUP_ENABLED=true` if overriding older disabled environment settings. Set signup false only for administrator-provisioned accounts.
3. Add the deployed application domain to Firebase Authentication's authorized domains. Add localhost explicitly for local provider testing if needed.
4. Enable Google in the Firebase console and configure the project's support email. Set `VITE_AUTH_GOOGLE_ENABLED=true`.
5. For GitHub, create an OAuth application and use the exact callback URL displayed by Firebase (normally `https://<auth-domain>/__/auth/handler`). Put its client ID and client secret in the Firebase console, then set `VITE_AUTH_GITHUB_ENABLED=true`. The app adds no repository-access scopes.
6. In Firebase email templates, set the custom action URL to the deployed `auth-action.html`. Verify the complete reset/verification links retain Firebase's `mode` and `oobCode` query parameters. The app's continue URLs must be authorized.
7. Restart/rebuild after changing flags. Frontend flags alone do not enable providers in Firebase.

With auth enabled, password accounts must verify their email before entering the workspace. OAuth identity or successful registration does not grant data access. Server rules must enforce roles, institution membership and permissions independently. Provider collisions direct the user to their original sign-in method; the app does not silently link accounts.

Signup sends one verification request, then carries its delivery result to the verification page. A successful send starts a 60-second resend cooldown; Firebase's `auth/too-many-requests` starts a five-minute local backoff. Account/project-scoped delivery status persists across refreshes when browser storage is available, with an in-memory fallback. Pending requests share one promise, and the app never retries automatically. Firebase's actual restriction can outlast this local timer; the app does not promise that waiting five minutes removes it. Send failures remain visible and do not require creating the account again. Verification status checking remains available during the resend cooldown.

The first send error's Firebase code is retained across navigation and shown under **Delivery details**; raw error messages and tokens are not persisted. A successful SDK request confirms Firebase acceptance, not inbox delivery. On local loopback addresses, verification and reset requests omit the optional continue URL to avoid rejection from missing local authorized-domain entries. Complete verification in the configured email handler, then return to the original app tab and check verification. Deployed sites keep their continue URLs and must authorize their domain. On inspection, the existing project's public authorized-domain list included localhost and acurion.vercel.app, but not 127.0.0.1; project settings were not changed.

An email sign-in attempt with deliberately invalid synthetic credentials reached the existing project's Firebase Authentication and returned the expected incorrect-credentials response. This verifies that the client no longer blocks email sign-in before the SDK request; it does not prove a successful login with a real account. Google/GitHub account consent and real reset/verification emails require validation after provider activation.

## Motion behavior

Shared button states use approximately 220 ms easing, with short press feedback. Page content fades in over 280 ms, auth cards over 320 ms, and the sidebar selection moves over 360 ms. Full-page navigation has a short 120 ms content exit. The sidebar remains usable during that exit, and a subsequent click updates the pending destination.

Local compliance views and report tabs update live, then animate their content. A persistent marker moves without rebuilding the navigation. Full-page links remember its last rendered position so it glides to the next destination. Back/forward cache restoration clears any obsolete exit animation. Modified-click, download and external-link semantics are preserved.

The application respects `prefers-reduced-motion`: page animations and sidebar transitions are disabled. React HoldButton retains its required hold-to-confirm behavior.

## Primary references

- [Google sign-in](https://firebase.google.com/docs/auth/web/google-signin)
- [GitHub sign-in](https://firebase.google.com/docs/auth/web/github-auth)
- [Password authentication](https://firebase.google.com/docs/auth/web/password-auth)
- [User management and email verification](https://firebase.google.com/docs/auth/web/manage-users)
- [Custom email action handlers](https://firebase.google.com/docs/auth/custom-email-handler)
