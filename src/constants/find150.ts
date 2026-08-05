// Find My 150 — tunable pipeline constants.
// Kept in one place so the recency window and surfaced-cluster count can be
// adjusted after real test-device runs, without hunting through the pipeline code.

// How far back the photo scan looks. Bounds on-device compute/battery cost
// and keeps ranking biased toward who matters *now*, not years ago.
export const PHOTO_SCAN_WINDOW_MONTHS = 18;

// Minimum photos in a cluster before it's worth surfacing — filters out
// one-off group shots / strangers caught in the background.
export const MIN_CLUSTER_PHOTO_COUNT = 3;

// Max number of "who is this?" cards shown in one labeling session.
export const MAX_CLUSTERS_TO_SURFACE = 20;

// Cosine similarity threshold for merging a new face embedding into an
// existing cluster vs. starting a new one.
export const CLUSTER_SIMILARITY_THRESHOLD = 0.6;
