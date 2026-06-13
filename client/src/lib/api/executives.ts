import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Executive } from './types';

export function useCreateExecutive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (executive: Partial<Executive>) => {
      const response = await fetch('/api/executives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(executive),
      });
      if (!response.ok) throw new Error('Failed to create executive');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
  });
}

export function useUpdateExecutive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Executive> }) => {
      const response = await fetch(`/api/executives/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to update executive');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
  });
}

export function useDeleteExecutive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/executives/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete executive');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
  });
}
