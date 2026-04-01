import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from './client';
import {
  MemoryEvent, MemoryEntry, Connection,
  User, PaginatedResponse, ApiResponse
} from '@/types';

// ── Query keys ─────────────────────────────────────────
export const QueryKeys = {
  memories: ['memories'] as const,
  memory: (id: string) => ['memories', id] as const,
  connections: ['connections'] as const,
  connection: (id: string) => ['connections', id] as const,
  me: ['me'] as const,
};

// ── Memories ───────────────────────────────────────────
export const useMemories = () =>
  useQuery({
    queryKey: QueryKeys.memories,
    queryFn: async (): Promise<MemoryEvent[]> => {
      const { data } = await api.get<ApiResponse<MemoryEvent[]>>('/memories');
      return data.data;
    },
    staleTime: 1000 * 60 * 5,
  });

export const useMemory = (id: string) =>
  useQuery({
    queryKey: QueryKeys.memory(id),
    queryFn: async (): Promise<MemoryEvent> => {
      const { data } = await api.get<ApiResponse<MemoryEvent>>(`/memories/${id}`);
      return data.data;
    },
  });

export const useCreateMemory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<MemoryEvent> & { memoryText?: string }): Promise<MemoryEvent> => {
      const { memoryText, ...eventPayload } = payload;
      // Step 1: create the event
      const { data } = await api.post<ApiResponse<MemoryEvent>>('/memories', eventPayload);
      const event = data.data;
      // Step 2: post the first perspective if text was provided
      if (memoryText?.trim()) {
        await api.post(`/memories/${event.id}/entries`, { text: memoryText });
      }
      return event;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QueryKeys.memories }),
  });
};

export const useAddMemoryEntry = (eventId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (text: string): Promise<MemoryEntry> => {
      const { data } = await api.post<ApiResponse<MemoryEntry>>(
        `/memories/${eventId}/entries`,
        { text }
      );
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QueryKeys.memory(eventId) }),
  });
};

export const useUpdateMemoryEntry = (eventId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ entryId, text }: { entryId: string; text: string }) => {
      const { data } = await api.patch(
        `/memories/${eventId}/entries/${entryId}`,
        { text }
      );
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QueryKeys.memory(eventId) }),
  });
};

// ── Connections ────────────────────────────────────────
export const useConnections = (layer?: string) =>
  useQuery({
    queryKey: [...QueryKeys.connections, layer],
    queryFn: async (): Promise<Connection[]> => {
      const params = layer ? { layer } : {};
      const { data } = await api.get<ApiResponse<Connection[]>>('/connections', { params });
      return data.data;
    },
    staleTime: 1000 * 60 * 2,
  });

export const useConnection = (id: string) =>
  useQuery({
    queryKey: QueryKeys.connection(id),
    queryFn: async (): Promise<Connection> => {
      const { data } = await api.get<ApiResponse<Connection>>(`/connections/${id}`);
      return data.data;
    },
  });

export const useConnectionSearch = (query: string) =>
  useQuery({
    queryKey: ['connections', 'search', query],
    queryFn: async () => {
      if (query.length < 2) return [];
      const { data } = await api.get<ApiResponse<any[]>>(
        `/connections/search?q=${encodeURIComponent(query)}`
      );
      return data.data;
    },
    enabled: query.length >= 2,
    staleTime: 0,
  });

// ── Current user ───────────────────────────────────────
export const useMe = () =>
  useQuery({
    queryKey: QueryKeys.me,
    queryFn: async (): Promise<User> => {
      const { data } = await api.get<ApiResponse<User>>('/users/me');
      return data.data;
    },
    staleTime: 1000 * 60 * 10,
  });

// ── Media upload (presigned S3) ────────────────────────
export const useUploadPhoto = () =>
  useMutation({
    mutationFn: async (localUri: string): Promise<string> => {
      // Step 1: get presigned URL from our API
      const { data } = await api.post<ApiResponse<{ uploadUrl: string; publicUrl: string }>>(
        '/media/presign',
        { contentType: 'image/jpeg' }
      );
      const { uploadUrl, publicUrl } = data.data;

      // Step 2: upload directly to S3 — bypasses our API server
      const blob = await fetch(localUri).then((r) => r.blob());
      await fetch(uploadUrl, {
        method: 'PUT',
        body: blob,
        headers: { 'Content-Type': 'image/jpeg' },
      });

      // Step 3: confirm upload with our API
      await api.post('/media/confirm', { publicUrl });

      return publicUrl;
    },
  });
