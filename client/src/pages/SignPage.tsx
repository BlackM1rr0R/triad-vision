import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, errorCode } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesSign } from '@/i18n/pagesSign';
import { InvalidLink, SigningFlow, SigningSkeleton } from '@/components/esign/SigningFlow';
import type { SigningView } from '@/components/esign/api';

registerCopy(pagesSign);

/** Public signing page for the personal email link (/sign/:token). Works without an account. */
export default function SignPage() {
  const { t } = useTranslation();
  const { token = '' } = useParams();
  const base = `/sign/${token}`;
  const { data, error, isLoading } = useQuery({
    queryKey: ['esign', 'link', token],
    queryFn: async () => (await api.get<SigningView>(base)).data,
    retry: (count, err) => count < 2 && errorCode(err) === 'NETWORK',
    refetchOnWindowFocus: false,
  });
  const [view, setView] = useState<SigningView | null>(null);
  useEffect(() => {
    if (data) setView(data);
  }, [data]);
  usePageTitle(view?.request.title ?? t('esign.sign.eyebrow'));

  return (
    <div className="min-h-screen bg-canvas px-4 pt-24 pb-16 sm:pt-28 sm:pb-24 lg:pt-36">
      {isLoading ? <SigningSkeleton /> : error || !view ? <InvalidLink /> : <SigningFlow view={view} base={base} onChange={setView} />}
    </div>
  );
}
