import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { CurrentUser as User } from '@minicoze/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ResponseInterceptor } from '../../common/response.interceptor';
import { OperationsAgentsQuery, OperationsDocumentsQuery, OperationsPageQuery, OperationsSearchQuery, OperationsRunsQuery } from './operations.dto';
import { OperationsService } from './operations.service';
import { OperationRecordsService } from './collection/operation-records.service';

@Controller('operations')
@UseGuards(AuthGuard('jwt'))
@UseInterceptors(ResponseInterceptor)
export class OperationsController {
  constructor(private readonly operations: OperationsService, private readonly records: OperationRecordsService) {}

  @Get('runtime/stats')
  runtimeStats(@CurrentUser() user: User) { return this.records.stats(user.id); }

  @Get('runtime/runs')
  runtimeRuns(@CurrentUser() user: User, @Query() query: OperationsRunsQuery) { return this.records.list(user.id, query); }

  @Get('runtime/runs/:id')
  runtimeDetail(@CurrentUser() user: User, @Param('id', new ParseUUIDPipe()) id: string) { return this.records.detail(user.id, id); }

  @Get('overview')
  overview(@CurrentUser() user: User) { return this.operations.overview(user.id); }

  @Get('agents')
  agents(@CurrentUser() user: User, @Query() query: OperationsAgentsQuery) { return this.operations.agents(user.id, query); }

  @Get('agents/:id/conversations')
  conversations(@CurrentUser() user: User, @Param('id') id: string, @Query() query: OperationsSearchQuery) { return this.operations.conversations(user.id, id, query); }

  @Get('conversations/:id/messages')
  messages(@CurrentUser() user: User, @Param('id', new ParseUUIDPipe()) id: string, @Query() query: OperationsPageQuery) { return this.operations.messages(user.id, id, query); }

  @Get('knowledge-bases')
  bases(@CurrentUser() user: User, @Query() query: OperationsSearchQuery) { return this.operations.bases(user.id, query); }

  @Get('knowledge-bases/:id/documents')
  documents(@CurrentUser() user: User, @Param('id') id: string, @Query() query: OperationsDocumentsQuery) { return this.operations.documents(user.id, id, query); }
}
