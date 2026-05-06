// Roots — core TypeScript types
// Mirrors the data model in spec §8 exactly.

export type DunbarLayer = 'intimate' | 'close' | 'active' | 'meaningful';

export type VisibilityLevel = 'onlyUs' | 'intimate' | 'close' | 'active' | 'meaningful';

export type StatusDot = 'available' | 'busy' | 'sleeping';

// ── Users ──────────────────────────────────────────────
export interface User {
  id: string;
  displayName: string;
  email: string;
  phoneNumber?: string;
  avatarColour: string;       // one of 8 preset hex colours
  avatarUrl?: string;
  dateOfBirth: string;        // ISO date — 18+ gate enforced at signup
  city: string;
  lat: number;
  lng: number;
  settings: UserSettings;
  createdAt: string;
}

export interface UserSettings {
  bgUrl?: string;
  bgOpacity: number;          // 2–30%
  bgBlur: number;             // 0–30px
  twofa: boolean;
  notifs: boolean;
}

// ── Connections ────────────────────────────────────────
export interface Connection {
  id: string;
  userId: string;             // owner
  connectedUserId: string;
  relation: string;           // e.g. "best friend", "brother"
  layer: DunbarLayer;
  since: string;              // ISO date
  contactFrequency: number;   // target days between contact
  score: number;              // 0–100
  lastContactAt: string;      // ISO datetime
  nudge?: string;             // AI-generated nudge text, if any
  createdAt: string;
  // Populated from join
  connectedUser?: User;
}

// ── Events (Memories) ─────────────────────────────────
export interface MemoryEvent {
  id: string;
  title: string;
  date: string;               // ISO date
  location: string;
  lat?: number;
  lng?: number;
  music?: { title: string; artist: string };
  createdByUserId: string;
  visibility: VisibilityLevel;
  participantIds: string[];
  photoUrls: string[];
  createdAt: string;
  // Populated from join
  entries?: MemoryEntry[];
  participants?: User[];
  media?: string[];           // S3 photo/video URLs for this event
  newEntryCount?: number;     // unread perspectives since last visit
  hasMyEntry?: boolean;       // current user has already added a perspective
}

// ── Memory Entries ────────────────────────────────────
export interface MemoryEntry {
  id: string;
  eventId: string;
  authorId: string;
  text: string;
  time?: string;              // time within the event, if noted
  isNew: boolean;             // unread badge
  createdAt: string;
  // Populated from join
  author?: {
    id: string;
    displayName: string;
    avatarColour: string;
    avatarUrl?: string;
  };
}

// ── Invites ───────────────────────────────────────────
export interface Invite {
  id: string;
  fromUserId: string;
  toPhone?: string;
  toEmail?: string;
  name: string;
  relationContext: string;
  sentAt: string;
  acceptedAt?: string;
}

// ── API response wrappers ─────────────────────────────
export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ── Auth ──────────────────────────────────────────────
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;          // unix timestamp
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  displayName: string;
  email: string;
  password: string;
  dateOfBirth: string;        // ISO date — server validates 18+
  phoneNumber?: string;
}
