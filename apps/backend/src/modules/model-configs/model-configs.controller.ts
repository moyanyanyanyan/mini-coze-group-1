import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ResponseInterceptor } from '../../common/response.interceptor';
import {
  CreateModelConfigDto,
  ListModelConfigsQueryDto,
  UpdateModelConfigDto,
  UpdateModelConfigStatusDto,
} from './dto/model-config.dto';
import { ModelConfigsService } from './model-configs.service';

interface AuthenticatedUser {
  id: string;
}

@Controller('model-configs')
@UseInterceptors(ResponseInterceptor)
@UseGuards(AuthGuard('jwt'))
export class ModelConfigsController {
  constructor(private readonly configs: ModelConfigsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListModelConfigsQueryDto) {
    return this.configs.list(user.id, query);
  }

  @Post()
  @HttpCode(200)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateModelConfigDto) {
    return this.configs.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateModelConfigDto,
  ) {
    return this.configs.update(user.id, id, dto);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateModelConfigStatusDto,
  ) {
    return this.configs.updateStatus(user.id, id, dto.enabled);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.configs.remove(user.id, id);
  }
}
