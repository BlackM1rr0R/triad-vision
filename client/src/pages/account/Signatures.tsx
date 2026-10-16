import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePageTitle } from '@/lib/usePageTitle';
import { MySignaturesList, PortalSign } from '@/components/esign/MySignatures';

/** /account/signatures and /account/signatures/:signerId ("Documents to sign"). */
export default function AccountSignatures() {
  const { t } = useTranslation();
  const { signerId } = useParams();
  usePageTitle(t('esign.portal.title'));
  return signerId ? <PortalSign backTo="/account/signatures" /> : <MySignaturesList linkBase="/account/signatures" />;
}
