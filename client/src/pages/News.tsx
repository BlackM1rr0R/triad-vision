import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { PageHero } from '@/components/layout/PageHero';
import { Stagger, StaggerItem } from '@/components/motion';
import { PostCard } from '@/components/cards';
import { PageLoader } from '@/components/ui/Spinner';
import { api } from '@/lib/api';
import type { PostSummary } from '@/lib/types';

export default function News() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ['posts'],
    queryFn: async () => (await api.get<{ posts: PostSummary[] }>('/public/posts')).data.posts,
  });
  return (
    <>
      <PageHero title={t('news.pageTitle')} subtitle={t('news.title')} image="https://images.unsplash.com/photo-1467269204594-9661b134dd2b?auto=format&fit=crop&w=2000&q=70" />
      <section className="section">
        <div className="container-x">
          {isLoading ? (
            <PageLoader />
          ) : (
            <Stagger className="grid-cards md:grid-cols-2 lg:grid-cols-3">
              {data?.map((p) => (
                <StaggerItem key={p.id}>
                  <PostCard post={p} />
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </div>
      </section>
    </>
  );
}
