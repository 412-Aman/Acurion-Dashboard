# Authentication and motion

## Implemented pages

- `login.html`: email/password, Google, GitHub and Apple sign-in; explicit fictional demo entry.
- `signup.html`: optional email registration, name, password confirmation and verification email.
- `forgot-password.html`: recovery email request with a response that does not disclose account existence.
- `verify-email.html`: resend verification, refresh verified status and change account.
- `auth-action.html`: custom password-reset and verification email action handler. Email verification requires an explicit confirmation button; merely opening the page does not consume the action code.

The Firebase SDK performs these operations. No mock authentication success is displayed. Popup cancellation, disabled providers, network failures, invalid credentials and expired links have readable error states. The frontend registration/reset minimum is 12 characters; the Firebase project's password policy should enforce the institution's actual requirements.

## Deferred activation

The replacement Firebase project remains deferred. All auth flags default to false in `.env.example`; local review uses **Explore demo workspace**. Existing backend credentials were not changed, and no accounts, OAuth apps, email messages or paid services were created during this work.

When the project is ready:

1. Fill its public web-app configuration in `.env.local` as described in [Firebase setup](FIREBASE_SETUP.md).
2. Enable Email/Password in Firebase Authentication, then set `VITE_AUTH_ENABLED=true`. Set `VITE_AUTH_SIGNUP_ENABLED=true` only if user registration is intended.
3. Add the deployed application domain to Firebase Authentication's authorized domains. Add localhost explicitly for local provider testing if needed.
4. Enable Google in the Firebase console and configure the project's support email. Set `VITE_AUTH_GOOGLE_ENABLED=true`.
5. For GitHub, create an OAuth application and use the exact callback URL displayed by Firebase (normally `https://<auth-domain>/__/auth/handler`). Put its client ID and client secret in the Firebase console, then set `VITE_AUTH_GITHUB_ENABLED=true`. The app adds no repository-access scopes.
6. Apple is optional. Firebase's [Apple provider instructions](https://firebase.google.com/docs/auth/web/apple) require Apple Developer Program membership and Apple configuration, including a Services ID and private signing credentials. Use an existing membership if available; leave `VITE_AUTH_APPLE_ENABLED=false` otherwise. Do not put private keys or provider secrets in VITE variables.
7. In Firebase email templates, set the custom action URL to the deployed `auth-action.html`. Verify the complete reset/verification links retain Firebase's `mode` and `oobCode` query parameters. The app's continue URLs must be authorized.
8. Restart/rebuild after changing flags. Frontend flags alone do not enable providers in Firebase.

With auth enabled, password accounts must verify their email before entering the workspace. OAuth identity or successful registration does not grant data access. Server rules must enforce roles, institution membership and permissions independently. Provider collisions direct the user to their original sign-in method; the app does not silently link accounts.

Google/GitHub/Apple account consent and real reset/verification emails require validation after project activation. The current browser checks cover deferred configuration, validation, page navigation and safe demo access; they do not prove a live OAuth round trip.

## Motion behavior

Shared button states use approximately 220 ms easing, with short press feedback. Page content fades in over 280 ms, auth cards over 320 ms, and the sidebar selection moves over 360 ms. Full-page navigation has a short 120 ms content exit. The sidebar remains usable during that exit, and a subsequent click updates the pending destination.

Local compliance views and report tabs update live, then animate their content. A persistent marker moves without rebuilding the navigation. Full-page links remember its last rendered position so it glides to the next destination. Back/forward cache restoration clears any obsolete exit animation. Modified-click, download and external-link semantics are preserved.

The application respects `prefers-reduced-motion`: page animations and sidebar transitions are disabled. React HoldButton retains its required hold-to-confirm behavior.

## Primary references

- [Google sign-in](https://firebase.google.com/docs/auth/web/google-signin)
- [GitHub sign-in](https://firebase.google.com/docs/auth/web/github-auth)
- [Apple sign-in](https://firebase.google.com/docs/auth/web/apple)
- [Password authentication](https://firebase.google.com/docs/auth/web/password-auth)
- [User management and email verification](https://firebase.google.com/docs/auth/web/manage-users)
- [Custom email action handlers](https://firebase.google.com/docs/auth/custom-email-handler)
