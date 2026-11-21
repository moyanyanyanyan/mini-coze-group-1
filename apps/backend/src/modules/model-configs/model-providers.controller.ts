import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ResponseInterceptor } from '../../common/response.interceptor';
import { CreateModelProviderDto, UpdateModelProviderDto } from './dto/model-config.dto';
import { ModelProvidersService } from './model-providers.service';

interface AuthenticatedUser {
  id: string;
}

@Controller('model-providers')
@UseInterceptors(ResponseInterceptor)
@UseGuards(AuthGuard('jwt'))
export class ModelProvidersController {
  constructor(private readonly providers: ModelProvidersService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.providers.list(user.id);
  }

  @Post()
  @HttpCode(200)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateModelProviderDto) {
    return this.providers.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateModelProviderDto,
  ) {
    return this.providers.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.providers.remove(user.id, id);
  }
}
