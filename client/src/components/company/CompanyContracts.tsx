import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MySignaturesList, PortalSign } from '@/components/esign/MySignatures';

/** Employer portal: "Contracts to sign" (/company/contracts and /company/contracts/:signerId). */
export const CompanyContracts = () => {
  const { t } = useTranslation();
  const { signerId } = useParams();
  return signerId ? <PortalSign backTo="/company/contracts" /> : <MySignaturesList linkBase="/company/contracts" title={t('esign.portal.companyTitle')} />;
};
