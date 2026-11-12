import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { CurrentUser as CurrentUserPayload } from '@minicoze/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ResponseInterceptor } from '../../common/response.interceptor';
import { ModelsService } from './models.service';
import { CreateModelDto } from './dto/create-model.dto';
import { UpdateModelDto } from './dto/update-model.dto';
import { ListModelsQueryDto } from './dto/list-models.query.dto';

@Controller('models')
@UseInterceptors(ResponseInterceptor)
@UseGuards(AuthGuard('jwt'))
export class ModelsController {
  constructor(private readonly models: ModelsService) {}

  @Get()
  list(@Query() query: ListModelsQueryDto) {
    return this.models.list(query.includeDisabled === true);
  }

  @Post()
  create(@Body() dto: CreateModelDto, @CurrentUser() user: CurrentUserPayload) {
    return this.models.create(dto, user);
  }

  @Patch(':key')
  update(
    @Param('key') key: string,
    @Body() dto: UpdateModelDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.models.update(key, dto, user);
  }

  @Post(':key/default')
  setDefault(@Param('key') key: string) {
    return this.models.setDefault(key);
  }

  @Delete(':key')
  remove(@Param('key') key: string) {
    return this.models.remove(key);
  }
}
