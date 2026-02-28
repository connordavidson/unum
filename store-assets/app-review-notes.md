# App Review Notes — Unum

Paste the contents of this file into the "Notes for App Review" field in App Store Connect before submitting.

---

## Notes for Reviewers

**Thank you for reviewing Unum!** Here is everything you need to test the app's core features.

---

### What Unum does

Unum is a location-based photo and video sharing app. Users capture media and post it pinned to a real-world GPS location on an interactive map. Other users can browse posts on the map, vote on them, and report inappropriate content.

---

### How to sign in

Sign in using your Apple ID via the "Sign in with Apple" button. This is the only sign-in method the app supports (iOS only).

Browsing the map and viewing posts does not require signing in. Posting and voting require a signed-in account.

---

### How to use the Camera

The camera uses **gesture-based controls** (a first-launch overlay explains these on first open):

| Gesture | Action |
|---|---|
| **Tap** the capture button | Take a photo |
| **Hold** the capture button | Record video (up to 60 seconds) |
| **Swipe up** while holding | Zoom in / out |
| **Swipe right** while holding | Lock hands-free recording |
| **Tap** button again when locked | Stop locked recording |

To access the camera, tap the camera icon (bottom-right of the map). You must be signed in.

---

### Location permission

The app requests **"While Using the App"** location permission. This is used to:
- Center the map on your current position
- Tag your posts with GPS coordinates

**Location is only read at the moment you press "Post"** — the app does not track or store your location continuously.

If you are testing at a desk and want to use a simulated location, any valid coordinates will work (the app does not enforce any location-based restrictions).

---

### Content moderation

Every photo and video is screened by AWS Rekognition before upload. Content flagged as explicit, violent, or otherwise inappropriate is rejected before reaching the server.

Users can also report posts and block other users via the in-app report modal (three-dot menu on any post card or map marker).

---

### Account deletion

To delete an account: tap the profile icon (top-left of map) → "Delete Account". This permanently removes all posts, votes, and account data.

---

### Demo account

You can use your own Apple ID — no separate test credentials are needed. The app does not require any special account setup or invite code.

---

### Network requirements

The app requires an active internet connection for:
- Loading posts on the map
- Uploading photos/videos
- Voting and reporting

An offline banner will appear on the map when no connection is detected.

---

### Encryption declaration

This app uses only standard encryption (HTTPS/TLS for all network requests, iOS Keychain for credential storage). It qualifies for the standard encryption exemption and does not require an export compliance review.
