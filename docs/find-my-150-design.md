# Find My 150 — Photo-Based Discovery: Design (pre-build)

Status: design phase, not yet built. Build is intended to happen in parallel while other roadmap items (monetization decisions, shared-memories UI reframe) get ironed out.

## Why photos over calendar

Calendar attendee-matching was the original plan (partially built via `useSyncCalendar`), but it's a weak signal for personal relationships: close friends and family rarely generate calendar events — you call or see them without scheduling it — so calendar-based ranking would systematically favor professional/logistics contacts over the people who actually matter most. Dropped in favor of photo co-occurrence as the primary ranking signal, with device contacts remaining the candidate pool.

## Why this is a bigger lift than contacts/calendar

Apple does not expose its own Photos "People" face-clustering to third-party apps — there is no public API for "which named person is in this photo." Vision framework only offers face *detection* (bounding boxes), not identity. To get "who appears most," Roots has to build its own pipeline: detect faces, extract embeddings, cluster them, and let the user label clusters. This requires native code (Vision/CoreML on iOS, ML Kit on Android) wrapped in a custom Expo module — which means leaving Expo Go for local dev and building a custom EAS dev client.

## Pipeline (see diagram: find_my_150_photo_pipeline)

**Phase 1 — on-device, background job (new build)**
1. Windowed photo scan — last 12–18 months only, not the full library. Bounds compute/battery cost; also matches the intent (who matters *now*, not 5 years ago).
2. Face detection + embedding — Vision/CoreML (or ML Kit on Android) detects faces; a lightweight on-device embedding model (FaceNet-style, via CoreML/TFLite) vectorizes each face.
3. Incremental clustering — compare each new embedding to existing cluster centroids via cosine similarity; merge above a threshold, else start a new cluster. Avoids needing to guess a target cluster count up front.

**Phase 2 — on-device, foreground (new build)**
4. Rank clusters by photo count + recency weighting.
5. "Who is this?" labeling UI — surface the top ~20 clusters (representative photo + count), same interaction pattern as Apple's own Photos People album, so it won't feel novel or invasive to users.

**Phase 3 — handoff into existing Roots systems (reused, not rebuilt)**
6. Match to contact — reuses the `nameScore`/phone-match logic already in `POST /api/connections/sync-contacts`.
7. Suggested Dunbar layer — photo-count percentile maps to a suggested layer, prefilling the existing `AddPersonModal` rather than new UI.
8. Circle + nudge engine — once added, the new connection is scored and nudged exactly like any other, via the existing `nudgeEngine.js`.

Net new engineering surface is narrow: only Phases 1–2. Phase 3 is almost entirely existing code.

## Privacy alignment

`privacy.tsx` already promises: "we read only the minimum data needed — interaction frequency and timestamps... processed on your device and immediately discarded." Running Phases 1–2 fully on-device satisfies this directly — no raw photos or face embeddings ever need to leave the device. Only the labeled outcome (a name + a photo count, i.e. exactly the "frequency and timestamps" already promised) is sent to the server, via the same shape of endpoint as the existing sync-contacts flow.

## Dev/build framework (see diagram: find_my_150_dev_framework)

Confirmed from the actual repo config:
- **Managed Expo, no ejection yet** — no `ios/`/`android/` native directories exist; `app.json` plugins are all standard Expo config plugins today.
- **EAS dev-client profile already exists** — `eas.json` has a `development` build profile with `developmentClient: true` already configured. Nobody has built from it yet, but the pipeline itself doesn't need to be created from scratch.
- **Photo library permission copy — decided and updated.** `app.json`'s `NSPhotoLibraryUsageDescription` now reads: "Roots uses your photo library to let you attach photos to memories, and — only if you turn it on — to look through your photos from time to time and suggest people you may want to add to your circle. Find My 150 is entirely optional, runs on your device only, and no photo ever leaves your phone or reaches our servers." One correction worth noting: iOS shows one fixed string per permission key regardless of which feature triggers it, and the existing "attach photo to memory" flow (`ImagePicker.requestMediaLibraryPermissionsAsync()` in `new-memory.tsx`/`memory/[id].tsx`) already requires the same *read* permission Find My 150 needs — there's no way to give each feature its own separate system-dialog copy, so the string above has to honestly describe both uses at once. A cheaper way to keep the Find My 150 framing front-and-center for users who never touch memories: add an in-app "soft ask" screen immediately before the system dialog, specifically when the user opts into Find My 150, so they see the feature-specific pitch even though the OS dialog text is shared.
- **`expo-media-library` is not yet a dependency** — `expo-image-picker`/`expo-camera` exist but only support user-driven single/multi selection, not bulk background enumeration of the library. This needs to be added.

Layering:
- Screens (`connect.tsx`) — the "Find My 150" button already exists as a stub; wiring it up is a UI change only, no native work.
- New hooks in `src/api/hooks.ts` — `useScanPhotos`, `useClusters`, `useLabelCluster`, following the existing hook patterns (`useSyncContacts` etc.) exactly.
- **Boundary: Expo Go stops here.** Everything above this line runs fine in Expo Go. Everything below requires the custom dev client.
- New native bridge module — an Expo config plugin plus Swift/Kotlin code wrapping the OS face pipeline, exposed to JS as a thin native module.
- OS ML frameworks — iOS Vision/CoreML, Android ML Kit — no cross-platform off-the-shelf package does this; the native module is unavoidable.

## Decisions (closed 2026-08-04)
- **Permission copy** — decided and applied to `app.json` (see above).
- **iOS first** — confirmed. Android testing hasn't started on the app generally yet, so no simultaneous ML Kit work; Android is a fast-follow once the iOS pipeline is validated.
- **Recency window / surfaced-cluster count** — set as tunable constants in `src/constants/find150.ts` rather than hardcoded inline, since these are genuinely guesses until tested against real libraries:
  - `PHOTO_SCAN_WINDOW_MONTHS = 18`
  - `MIN_CLUSTER_PHOTO_COUNT = 3` (filters out one-off/stranger shots)
  - `MAX_CLUSTERS_TO_SURFACE = 20`
  - `CLUSTER_SIMILARITY_THRESHOLD = 0.6`
  Treat these as a first guess to be tuned once the pipeline runs against real test-device photo libraries — not a final spec.
- **First EAS dev-client build starts now**, in parallel with continued work on the rest of the app. Note on scope: the actual native Swift/Vision/CoreML code and the `eas build` invocation require Xcode and an authenticated Apple Developer session, which aren't available in this environment — that part has to run on your side. What can be prepared here ahead of that: the `expo-media-library` dependency addition, the Expo config-plugin skeleton, and the TypeScript-side native module interface, so the native implementation has a defined contract to build against. Say the word if you want that scaffolding done now.

## Related open question: memory visibility with multiple authors

Raised separately, but worth capturing here since it touches the same "who controls what" theme as Find My 150's opt-in framing. See the shared-memories addendum in `roots-handoff-monetization-and-memories.md` — short version: `events.visibility` is a single field, settable only by the memory's creator ("creator only" per the `PATCH /api/memories/:id` handler). `memory_entries` (the per-author perspectives) and `memory_media` don't carry their own visibility field — they inherit the one value on the parent event. So today, if two people share a memory, only whoever created it controls who else can see it; a co-author who adds their own entry has no way to loosen or tighten that audience for their own contribution. Worth a real decision before the memories UI reframe goes further — options range from keeping single creator-controlled visibility (simplest, but not truly mutual) to per-entry visibility overrides (flexible, but a real data-model and UI expansion).
