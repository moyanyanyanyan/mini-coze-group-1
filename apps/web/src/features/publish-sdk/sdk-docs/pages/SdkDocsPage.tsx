import { SdkDocsView } from '@minicoze/ui/sdk-docs';
import { AppLink } from '../../../../shared/routing/AppLink';
import { API_MANAGEMENT_ROUTE } from '../../api-management/router/routes';

export function SdkDocsPage() {
  return <SdkDocsView LinkComponent={AppLink} apiManagementRoute={API_MANAGEMENT_ROUTE} />;
}
