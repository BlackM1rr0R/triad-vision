# Triad Vision — mobile app (iOS + Android)

Expo SDK 57 · React Native 0.86 · React 19 · TypeScript · expo-router.

One app, two experiences after login:

| Role | Tabs | What they can do |
| --- | --- | --- |
| **Client** (candidate) | Home · My case · Messages · Alerts · Profile | See the case and all 6 steps, upload documents (camera / gallery / PDF·DOC picker), delete un-reviewed uploads, submit for review, e-sign the contract with a finger signature pad, see the embassy appointment and add it to the calendar, see the decision (approved / refused + reason), chat with the manager, notifications, profile + language + password, create a new application |
| **Staff / Admin** | Dashboard · Cases · Alerts · Profile | Dashboard counts + "waiting for you", case list with status filter + search + "assigned to me", case detail (overview, document review accept/reject-with-note/reset, open files, contract + signer data), workflow actions valid for the current status (send contract PDF, request changes, confirm/reject signature, schedule/reschedule appointment with date+time picker and place, mark lodged, decide approved/refused with reason and validity, cancel, reopen), messages, internal notes, timeline, assign to me |

Public screens (logged in or not): visa types + detail, services + detail, FAQ, contact (call / WhatsApp / email / maps). The eligibility quiz stays on the website and opens in an in-app browser. CMS editing, users and inquiries stay in the web admin.

---

## 1. Run it on your phone with Expo Go

**Prerequisites**

- Node 20+ and the API running on this PC: from the repo root `npm run dev` (or `npm run dev -w server`). The API listens on port **4000** on all network interfaces.
- The **Expo Go** app from the App Store / Play Store (it must support **SDK 57**).
- Phone and PC on the **same Wi-Fi** network.

**Steps**

```bash
cd mobile
npm install
cp .env.example .env        # then edit EXPO_PUBLIC_API_URL (see below)
npm start                   # = npx expo start --go
```

Scan the QR code: Android → inside Expo Go ("Scan QR code"); iOS → with the Camera app.

### The API URL (why `localhost` does not work)

On the phone, `localhost` is the phone itself. The app must call the PC by its **LAN IP**:

1. Run `ipconfig` on the PC and take the **IPv4 address** of the Wi-Fi adapter, e.g. `192.168.1.20`.
2. In `mobile/.env`: `EXPO_PUBLIC_API_URL=http://192.168.1.20:4000/api`
3. Restart `npm start` after changing `.env` (it is inlined at bundle time).

If `EXPO_PUBLIC_API_URL` is not set, the app guesses: it reuses the IP of the Expo dev server (the IP in the QR code) with port 4000. That usually just works in Expo Go.

| Where the app runs | API URL |
| --- | --- |
| Real phone (Expo Go / dev build) | `http://<PC-LAN-IP>:4000/api` |
| Android emulator | `http://10.0.2.2:4000/api` |
| iOS simulator (Mac only) | `http://localhost:4000/api` |
| Preview / production builds | `https://triad-vision.de/api` (set in `eas.json`) |

Quick check from the phone's browser: open `http://<PC-LAN-IP>:4000/api/health` — it must show `{"ok":true}`.

### Windows firewall

Windows blocks incoming connections by default. Allow the API port (and Metro, 8081) on **private** networks — PowerShell as Administrator:

```powershell
New-NetFirewallRule -DisplayName "Triad Vision API (4000)" -Direction Inbound -Protocol TCP -LocalPort 4000 -Action Allow -Profile Private
New-NetFirewallRule -DisplayName "Expo Metro (8081)" -Direction Inbound -Protocol TCP -LocalPort 8081 -Action Allow -Profile Private
```

Also make sure the Wi-Fi network is set to **Private** in Windows settings, not Public. Guest / office Wi-Fi with "client isolation" blocks phone→PC traffic; use a phone hotspot instead. (`npx expo start --tunnel` only tunnels Metro, not the API.)

### Logging in

Use any client account (register in the app) or the staff/admin account from the server seed (`SEED_ADMIN_EMAIL`, default `admin@triad-vision.de`). The app picks the client or staff UI from the user's role.

---

## 2. What works in Expo Go vs. a development build

Everything in this app is plain Expo modules — **no custom native code**, so it runs in Expo Go. Two things are limited there by Expo Go itself:

| Feature | Expo Go (Android) | Expo Go (iOS) | Development / preview / production build |
| --- | --- | --- | --- |
| Login, cases, uploads (camera/gallery/files), e-signature, chat, staff workflow, i18n, offline banner | ✅ | ✅ | ✅ |
| Opening PDFs / images | ✅ (Android viewer intent) | ✅ (share sheet / Quick Look) | ✅ |
| In-app notification list + badge (polled every 60 s) | ✅ | ✅ | ✅ |
| **Remote push notifications** | ❌ removed from Expo Go since SDK 53 — the app skips registration | ⚠️ only with an EAS `projectId` configured | ✅ with EAS `projectId` + push credentials |
| **Add appointment to calendar** | Shares an `.ics` file → pick your calendar app | Shares an `.ics` file | ✅ writes the event directly via `expo-calendar` |

Profile → "Push notifications" shows the state on the device (on / off / "needs the installed app").

### How push works

1. After login the app registers silently if notifications are already allowed; otherwise Profile → "Push notifications" asks for permission when the user switches it on. It then gets an Expo push token (`getExpoPushTokenAsync({ projectId })`) and calls `POST /api/devices { token, platform }`.
2. Every status change / document review / new message on the server creates an in-app notification **and** sends an Expo push to the user's registered devices (`server/src/lib/push.ts`).
3. Tapping a push opens the right screen: clients → the case (or the chat for `NEW_MESSAGE`), staff → the staff case screen. This also works when the app was closed (cold start).
4. On logout — and whenever the server ends the session (expired after 14 days idle / 30 days, revoked by an admin or from another device) — the app calls `DELETE /api/devices { token }`, forgets the last tapped notification and deletes cached documents, so the phone stops receiving that user's pushes and a one-time message explains why the user was logged out.

Requirements for real push:

- An **EAS project id**: `npx eas-cli@latest login` (free Expo account) → `npx eas-cli@latest init` in `mobile/`, then put the printed id in **every** place that builds the app: the `EAS_PROJECT_ID` entry in the `env` of each `eas.json` profile (development, preview **and** production — store builds read it from there), `EAS_PROJECT_ID` in `.env` for local `expo run:*` builds, and/or the `COMMITTED_EAS_PROJECT_ID` constant in `app.config.ts`. All of them ship with the all-zero placeholder `00000000-0000-0000-0000-000000000000`, which `app.config.ts` ignores — the app then works, just without remote push (Profile → Push notifications shows "needs the installed app").
- **Android**: a Firebase project + FCM V1 service-account key uploaded with `npx eas-cli@latest credentials` (free).
- **iOS**: an APNs key, which requires the paid **Apple Developer Program** ($99/year). EAS can create it for you during `eas build`.
- A **development build** (or preview/production build) installed on the phone — see below.

Run a development build with `npm run start:dev-client` instead of `npm start`.

---

## 3. Building installable apps with EAS (later)

`eas.json` has three profiles:

| Profile | Output | Use |
| --- | --- | --- |
| `development` | APK / iOS dev client | Debugging with `expo-dev-client`, real push |
| `preview` | **Android APK** (internal distribution) / iOS ad-hoc | Install directly on test phones, points to `https://triad-vision.de/api` |
| `production` | Android App Bundle (Play Store) / iOS App Store build | Store releases, auto-incremented build numbers |

```bash
npm i -g eas-cli            # or use npx eas-cli@latest …
eas login                   # free Expo account
eas init                    # creates the EAS project → paste the id into app.config.ts
eas build -p android --profile preview      # → APK download link / QR code
eas build -p ios --profile preview          # needs Apple Developer account + registered devices
eas build -p android --profile production   # .aab for Google Play
eas submit -p android | ios                 # upload to the stores
```

Accounts needed:

- **Expo account** (free) — for every EAS build.
- **Android APK** for testers: nothing else — the preview APK installs directly ("install unknown apps").
- **Google Play** release: Google Play Console developer account (one-time $25) + FCM for push.
- **Any iOS build on a real iPhone** (ad-hoc, TestFlight, App Store): **Apple Developer Program** ($99/year). Without it you can only use Expo Go on iPhone.

Before a store release: set the production API URL in `eas.json`, replace the `EAS_PROJECT_ID` placeholder in every profile, and bump `version`. Plain-HTTP API access (`NSAllowsArbitraryLoads` / `usesCleartextTraffic`) is only emitted when `APP_VARIANT=development` (the `development` profile and `.env`), so preview/production builds are HTTPS-only automatically.

---

## 4. Scripts

| Command | What it does |
| --- | --- |
| `npm start` | Expo dev server for **Expo Go** (`expo start --go`) |
| `npm run start:dev-client` | Dev server for a development build |
| `npm test` | Jest (jest-expo) unit tests for the pure logic |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run doctor` | `expo-doctor` |
| `npm run export:android` / `export:ios` | Bundle the JS (proves the app compiles) into `dist/` |
| `npm run sync-i18n` | Re-generate `src/i18n/locales/*.json` from the web translations |
| `npm run gen-icons` | Re-generate `src/components/icons.ts` after using a new lucide icon |
| `npm run generate-assets` | Re-render the app icon, adaptive icon, splash and notification icon PNGs from the logo SVG |

## 5. Translations

- Languages: **az** (default), **de**, **en**, **ru**. First start uses the phone language (expo-localization), falling back to az. The user can switch in Profile; the app then `PATCH /api/auth/me { locale }` so emails and pushes arrive in the same language. After login the app follows the server-side locale.
- Web strings are **reused**: `scripts/sync-i18n.mjs` bundles `client/src/i18n/{az,de,en,ru,details,extra}.ts` with esbuild and writes `src/i18n/locales/*.json` (committed). Run `npm run sync-i18n` whenever the web texts change.
- Mobile-only strings live in `src/i18n/mobile.{az,de,en,ru}.json` under the `m.*` namespace and are deep-merged at runtime. A unit test checks all four files have identical keys.

## 6. Project structure

```
mobile/
  app.config.ts          name, bundle id de.triadvision.app, scheme triadvision, plugins, permissions
  eas.json               development / preview (APK) / production profiles
  metro.config.js        keeps Metro inside mobile/ (the repo root is a separate npm workspace)
  scripts/               sync-i18n, gen-icons, generate-assets
  assets/images/         generated icon, adaptive icon, splash, notification icon
  __tests__/             Jest tests (status→step, i18n merge, API errors, signature→SVG, routing, .ics)
  src/
    app/                 expo-router routes
      _layout.tsx        providers, fonts, splash, role-protected stacks, push tap routing
      welcome, login, register, forgot-password
      (client)/          home, my-case, messages, notifications, profile  (tabs)
      (staff)/           dashboard, queue, inbox, account               (tabs)
      cases/[id], chat/[id], sign/[id], apply, viewer
      staff/cases/[id], staff/action
      info/              visas, visa/[slug], services, service/[slug], faq, contact
    components/ui/       design system (Button, Card, Field, Badge, Skeleton, Sheet, Toast, Stepper, …)
    features/            case, chat, sign, staff, info, common (profile, notifications, explore)
    i18n/                i18next setup, synced web locales, mobile strings
    lib/                 api (axios + Bearer + uploads), auth, push, queries, caseStatus, errors, native helpers
    theme.ts, types.ts
```

The repo root is an npm workspace for `server` and `client` only — **mobile is deliberately not part of it** and has its own `node_modules`. Always install native packages with `npx expo install <pkg>` inside `mobile/` so versions match SDK 57.
