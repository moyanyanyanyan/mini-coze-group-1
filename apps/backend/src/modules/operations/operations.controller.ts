import { DocumentHistoryService } from './collection/document-history.service';
import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { CurrentUser as User } from '@minicoze/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ResponseInterceptor } from '../../common/response.interceptor';
import { OperationsAgentsQuery, OperationsDocumentsQuery, OperationsPageQuery, OperationsSearchQuery, OperationsRunsQuery } from './operations.dto';
import { OperationsService } from './operations.service';
import { OperationRecordsService } from './collection/operation-records.service';
import { OperationsLiveService } from './operations-live.service';

@Controller('operations')
@UseGuards(AuthGuard('jwt'))
@UseInterceptors(ResponseInterceptor)
export class OperationsController {
  constructor(private readonly operations: OperationsService, private readonly records: OperationRecordsService, private readonly documentHistory: DocumentHistoryService, private readonly live: OperationsLiveService) {}

  @Get('integrations/activity')
  integrations(@CurrentUser() user: User, @Query() query: OperationsPageQuery) { return this.live.integrations(user.id, query); }

  @Get('knowledge-bases/:id/activity')
  knowledgeActivity(@CurrentUser() user: User, @Param('id') id: string, @Query() query: OperationsPageQuery) { return this.live.knowledge(user.id, id, query); }

  @Get('runtime/stats')
  runtimeStats(@CurrentUser() user: User) { return this.records.stats(user.id); }

  @Get('runtime/runs')
  runtimeRuns(@CurrentUser() user: User, @Query() query: OperationsRunsQuery) { return this.records.list(user.id, query); }

  @Get('runtime/runs/:id')
  runtimeDetail(@CurrentUser() user: User, @Param('id', new ParseUUIDPipe()) id: string) { return this.records.detail(user.id, id); }

  @Get('overview')
  overview(@CurrentUser() user: User) { return this.operations.overview(user.id); }

  @Get('resources')
  resources(@CurrentUser() user: User) { return this.operations.resources(user.id); }

  @Get('agents')
  agents(@CurrentUser() user: User, @Query() query: OperationsAgentsQuery) { return this.operations.agents(user.id, query); }

  @Get('agents/:id/conversations')
  conversations(@CurrentUser() user: User, @Param('id') id: string, @Query() query: OperationsSearchQuery) { return this.operations.conversations(user.id, id, query); }

  @Get('conversations/:id/messages')
  messages(@CurrentUser() user: User, @Param('id', new ParseUUIDPipe()) id: string, @Query() query: OperationsPageQuery) { return this.operations.messages(user.id, id, query); }

  @Get('knowledge-bases')
  bases(@CurrentUser() user: User, @Query() query: OperationsSearchQuery) { return this.operations.bases(user.id, query); }

  @Get('knowledge-bases/:id/documents/:documentId/attempts')
  documentAttempts(@CurrentUser() user: User, @Param('id') id: string, @Param('documentId') documentId: string, @Query() query: OperationsPageQuery) { return this.documentHistory.list(user.id, id, documentId, query); }

  @Get('knowledge-bases/:id/documents/:documentId/text')
  documentText(@CurrentUser() user: User, @Param('id') id: string, @Param('documentId') documentId: string) { return this.operations.documentText(user.id, id, documentId); }

  @Get('knowledge-bases/:id/documents')
  documents(@CurrentUser() user: User, @Param('id') id: string, @Query() query: OperationsDocumentsQuery) { return this.operations.documents(user.id, id, query); }
}
