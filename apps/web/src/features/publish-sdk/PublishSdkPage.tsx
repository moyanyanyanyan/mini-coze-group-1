import { usePathname } from '../../shared/routing/navigation';
import { ApiKeyManagementPage } from './api-management';
import { SdkDocsPage } from './sdk-docs';
import { SDK_DOCS_ROUTE } from './sdk-docs/router/routes';

export function PublishSdkPage() {
  const pathname = usePathname();

  return pathname === SDK_DOCS_ROUTE
    ? <SdkDocsPage />
    : <ApiKeyManagementPage />;
}
