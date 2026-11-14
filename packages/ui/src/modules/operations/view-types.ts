import type { LinkComponentType } from '../../layouts/types';
import type { OperationsData, OperationRun, OperationTask } from './model';

export interface OperationsViewProps {
  profile?: { displayName: string; email: string; avatarUrl?: string | null };
  profileError?: string;
  data: OperationsData;
  pathname: string;
  search: string;
  LinkComponent: LinkComponentType;
}
export interface ContentProps extends OperationsViewProps {
  days: number;
  runs: OperationRun[];
  tasks: OperationTask[];
}
