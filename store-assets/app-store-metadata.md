# App Store Metadata — Unum

Use this file to track all copy and configuration fields for App Store Connect.
Update this file whenever the store listing changes.

---

## App Information

| Field | Value |
|---|---|
| **App Name** | Unum |
| **Subtitle** (30 chars max) | Share moments on the map |
| **Bundle ID** | com.unum.app |
| **SKU** | unum-ios-v1 |
| **Primary Language** | English (U.S.) |
| **Category** | Social Networking |
| **Secondary Category** | Photo & Video |

---

## Description

**Short description** (for editorial use, not a required field):

> Unum is a location-based photo and video app that lets you post moments to a shared map — see what's happening nearby and share what you see.

**Full description** (4,000 char limit):

```
Unum — see the world through the people in it.

Post photos and videos pinned to where you are, and explore what others have shared nearby. No followers, no algorithm — just a map of real moments from real places.

HOW IT WORKS

Tap the camera, capture a moment, and post it to the map. Your post appears as a pin at your current location, visible to everyone browsing nearby.

Browse the map to discover posts from your neighborhood, a park you're visiting, or anywhere else in the world. Zoom in to see individual posts; zoom out to see clusters of activity.

CAMERA CONTROLS

The camera is designed for quick capture:
• Tap to take a photo
• Hold to record video (up to 60 seconds)
• Slide up while holding to zoom
• Slide right while holding to lock hands-free recording

COMMUNITY

Vote posts up or down to surface the best content. Report anything inappropriate — every post is screened before it goes live, and community reports are reviewed promptly.

PRIVACY

Unum uses Sign in with Apple — no password, no email required. Your location is only used to tag your posts at the moment you press "Post." We don't track you, sell your data, or show ads.

Posts are public and visible to all users. You can delete your account and all your content at any time from the Profile menu.

For ages 17 and older.
```

---

## Keywords

(100 character limit — comma-separated, no spaces after commas)

```
map,photo,video,location,share,nearby,social,moments,explore,community,pins,local
```

---

## URLs

| Field | URL |
|---|---|
| **Privacy Policy URL** | https://unumapp.com/privacy |
| **Terms of Service URL** | https://unumapp.com/terms |
| **Support URL** | https://unumapp.com/support *(or mailto:support@unumapp.com)* |
| **Marketing URL** | https://unumapp.com *(optional)* |

---

## Age Rating Questionnaire

Answer these fields **honestly** in App Store Connect under "App Information → Age Rating":

| Question | Answer |
|---|---|
| Cartoon or Fantasy Violence | None |
| Realistic Violence | None |
| Sexual Content or Nudity | None *(Rekognition blocks explicit content)* |
| Profanity or Crude Humor | None |
| Alcohol, Tobacco, or Drug Use | None *(Rekognition blocks this)* |
| Mature/Suggestive Themes | None |
| Simulated Gambling | None |
| Horror/Fear Themes | None |
| Medical/Treatment Information | None |
| **User Generated Content** | **Frequent/Intense** |

**Expected rating: 17+** (matches the minimum age stated in Privacy Policy)

---

## Privacy Nutrition Labels

Fill these in under **App Store Connect → App Privacy**. They must match the actual data collected by the app and all integrated SDKs.

### Data Linked to You (used for app functionality)

| Category | Data Type | Purpose |
|---|---|---|
| Contact Info | Email Address (optional, from Apple Sign-In) | App Functionality |
| Identifiers | User ID (Apple ID identifier) | App Functionality |
| Location | Precise Location (at post time only) | App Functionality |
| Photos & Videos | Photos, Videos (content uploaded by user) | App Functionality |

### Data Not Linked to You (analytics/diagnostics only)

| Category | Data Type | Purpose |
|---|---|---|
| Diagnostics | Crash Data | Analytics |
| Diagnostics | Performance Data | Analytics |
| Usage Data | Product Interaction (screen views, taps) | Analytics |

### Tracking
- **Does this app track users?** No
- `NSPrivacyTracking` = false

---

## Export Compliance

| Question | Answer |
|---|---|
| Does your app use encryption? | Yes |
| Is it solely standard encryption? | Yes (HTTPS/TLS, iOS Keychain) |
| Exempt from EAR? | Yes |

Check **"Yes — exempt from EAR"** or the equivalent for standard encryption in App Store Connect.

---

## Screenshots

Required sizes (portrait orientation):

| Device | Screen Size | Required |
|---|---|---|
| iPhone 16 Pro Max | 6.9" | ✅ Required |
| iPhone 15 Plus / 14 Pro Max | 6.5" | ✅ Required |
| iPhone 8 Plus | 5.5" | ✅ Required |
| iPad Pro 12.9" | 12.9" | Optional (if submitted for iPad) |

**Suggested screenshot content:**

1. Map view with several posts/pins visible across a neighborhood
2. Camera screen ready to capture (live viewfinder)
3. Camera hint overlay showing gesture controls
4. Post card in the feed showing a photo with votes
5. Map search modal

### App Preview Video (optional but recommended)

A 15–30 second preview showing: open app → browse map → tap camera → tap to take photo → post → toast appears → post visible on map.

---

## What's New (v1.0.0)

```
Welcome to Unum!

Share photos and videos pinned to real-world locations on a shared map. Explore what's nearby, vote on posts, and discover moments from places you care about.
```

---

## Review Checklist Before Submission

- [ ] Privacy Policy URL returns a live page
- [ ] Terms of Service URL returns a live page
- [ ] Support URL / email is monitored
- [ ] All screenshot device sizes uploaded
- [ ] Age rating questionnaire completed (expect 17+)
- [ ] Privacy Nutrition Labels filled in
- [ ] Export compliance declared
- [ ] App Review Notes pasted in (see app-review-notes.md)
- [ ] `npx jest` passes with 0 failures
- [ ] TestFlight build tested on physical device
- [ ] Location denied → banner shows in MapScreen
- [ ] Camera denied → Settings prompt shows in CameraScreen
- [ ] First-launch camera → hint overlay appears
- [ ] Second launch camera → hint overlay does NOT appear
