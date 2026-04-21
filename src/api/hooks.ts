import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Platform } from 'react-native';
import api from './client';
import {
  MemoryEvent, MemoryEntry, Connection,
  User, PaginatedResponse, ApiResponse
} from '@/types';
import { useAuthStore } from '@/store/authStore';

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

export const useDeleteMemoryEntry = (eventId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entryId: string) => {
      const { data } = await api.delete(`/memories/${eventId}/entries/${entryId}`);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QueryKeys.memory(eventId) }),
  });
};

export const useUpdateMemory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      title,
      date,
      location,
      visibility,
      participantIds,
    }: {
      id: string;
      title?: string;
      date?: string;
      location?: string;
      visibility?: string;
      participantIds?: string[];
    }) => {
      const { data } = await api.patch(`/memories/${id}`, {
        title, date, location, visibility, participantIds,
      });
      return data.data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: QueryKeys.memory(vars.id) });
      qc.invalidateQueries({ queryKey: QueryKeys.memories });
    },
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

// Search all Roots users
export const useUserSearch = (query: string) =>
  useQuery({
    queryKey: ['users', 'search', query],
    queryFn: async () => {
      if (query.length < 2) return [];
      const { data } = await api.get(
        `/users/search?q=${encodeURIComponent(query)}`
      );
      return data.data;
    },
    enabled: query.length >= 2,
    staleTime: 0,
  });

// Add connection
export const useAddConnection = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      connectedUserId: string;
      relation: string;
      layer: string;
      since?: string;
      contactFrequency?: number;
    }) => {
      const { data } = await api.post('/connections', payload);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QueryKeys.connections }),
  });
};

// Remove connection
export const useRemoveConnection = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/connections/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QueryKeys.connections }),
  });
};

// Update connection
export const useUpdateConnection = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: {
      id: string;
      layer?: string;
      relation?: string;
      contactFrequency?: number;
    }) => {
      const { data } = await api.patch(`/connections/${id}`, payload);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QueryKeys.connections }),
  });
};

// Sync device contacts
export const useSyncContacts = () =>
  useMutation({
    mutationFn: async (contacts: Array<{ name: string; phoneNumber?: string }>) => {
      const { data } = await api.post('/connections/sync-contacts', { contacts });
      return data.data as {
        matched: any[];
        suggestions: any[];
        total: number;
      };
    },
  });

// Confirm a fuzzy contact match
export const useConfirmContactMatch = () =>
  useMutation({
    mutationFn: async ({ connectedUserId, phoneNumber }: {
      connectedUserId: string;
      phoneNumber: string;
    }) => {
      const { data } = await api.post('/connections/confirm-contact-match', {
        connectedUserId,
        phoneNumber,
      });
      return data.data;
    },
  });

// Log contact
export const useLogContact = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (connectionId: string) => {
      const { data } = await api.post(`/connections/${connectionId}/log-contact`);
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QueryKeys.connections });
    },
  });
};

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

export const useUpdateProfile = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      displayName?: string;
      city?: string;
      avatarColour?: string;
      avatarUrl?: string;
      phoneNumber?: string;
    }) => {
      const { data } = await api.patch('/users/me', payload);
      return data.data;
    },
    onSuccess: (user) => {
      useAuthStore.getState().setUser(user);
      qc.invalidateQueries({ queryKey: QueryKeys.me });
    },
  });
};

export const useChangePassword = () =>
  useMutation({
    mutationFn: async ({ currentPassword, newPassword }: {
      currentPassword: string;
      newPassword: string;
    }) => {
      const { data } = await api.patch('/users/me/password', { currentPassword, newPassword });
      return data.data;
    },
  });

export const useRegisterPushToken = () =>
  useMutation({
    mutationFn: async (token: string) => {
      const { data } = await api.post('/push-tokens', { token, platform: Platform.OS });
      return data.data;
    },
  });

export const useWhatsAppOptIn = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { whatsappNumber?: string; optedIn: boolean }) => {
      const { data } = await api.post('/users/me/whatsapp', payload);
      return data.data;
    },
    onSuccess: (_data, variables) => {
      // Update the auth store immediately so the screen reflects the saved values
      const currentUser = useAuthStore.getState().user;
      if (currentUser) {
        useAuthStore.getState().setUser({
          ...currentUser,
          whatsappNumber: variables.whatsappNumber ?? (currentUser as any).whatsappNumber,
          whatsappOptedIn: variables.optedIn,
        } as any);
      }
      qc.invalidateQueries({ queryKey: QueryKeys.me });
    },
  });
};

export const useContactEvents = (connectionId: string) =>
  useQuery({
    queryKey: ['contact_events', connectionId],
    queryFn: async () => {
      const { data } = await api.get(`/connections/${connectionId}/events`);
      return data.data as Array<{
        id: string;
        type: 'calendar' | 'call' | 'whatsapp' | 'memory' | 'manual';
        title: string;
        date: string;
        note?: string;
        memoryEventId?: string;
        createdAt: string;
      }>;
    },
  });

export const useCreateContactEvent = (connectionId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      type: string;
      title?: string;
      date: string;
      note?: string;
      memoryEventId?: string;
    }) => {
      const { data } = await api.post(
        `/connections/${connectionId}/events`,
        payload
      );
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact_events', connectionId] });
      qc.invalidateQueries({ queryKey: QueryKeys.connections });
    },
  });
};

export const useSyncCalendar = () =>
  useMutation({
    mutationFn: async (events: Array<{ title: string; date: string; attendees?: string[] }>) => {
      const { data } = await api.post('/connections/sync-calendar', { events });
      return data.data as { matches: any[]; total: number };
    },
  });

export const useConfirmCalendarMatch = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      connectionId: string;
      eventDate: string;
      eventTitle?: string;
      note?: string;
    }) => {
      const { data } = await api.post('/connections/confirm-calendar-match', payload);
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QueryKeys.connections });
    },
  });
};

