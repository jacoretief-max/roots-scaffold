// Trust & safety API (reports, blocks). See server/lib/safety.js.
import api from './client';

export type ReportTarget = 'photo' | 'memory' | 'entry' | 'user';
export type ReportReason = 'child_safety' | 'sexual' | 'harassment' | 'violence' | 'spam' | 'other';

export const REPORT_REASONS: { key: ReportReason; label: string; hint?: string }[] = [
  { key: 'child_safety', label: 'Child safety', hint: 'Content that sexualises or endangers a child' },
  { key: 'sexual', label: 'Nudity or sexual content' },
  { key: 'harassment', label: 'Harassment or bullying' },
  { key: 'violence', label: 'Violence or threats' },
  { key: 'spam', label: 'Spam or fake account' },
  { key: 'other', label: 'Something else' },
];

export async function reportContent(targetType: ReportTarget, targetId: string, reason: ReportReason, details?: string) {
  const { data } = await api.post('/reports', { targetType, targetId, reason, details });
  return data.data as { id: string };
}

export async function blockUser(userId: string) {
  await api.post(`/users/${userId}/block`);
}

export async function unblockUser(userId: string) {
  await api.delete(`/users/${userId}/block`);
}

export interface BlockedUser { id: string; displayName: string; avatarColour: string; blockedAt: string }
export async function getBlockedUsers(): Promise<BlockedUser[]> {
  const { data } = await api.get('/users/me/blocks');
  return data.data;
}
