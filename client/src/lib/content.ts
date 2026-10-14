import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { SiteContent } from './types';

export const useSiteContent = () =>
  useQuery({
    queryKey: ['content'],
    queryFn: async () => (await api.get<SiteContent>('/public/content')).data,
    staleTime: 10 * 60 * 1000,
  });
