import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { CurrentUser as CurrentUserPayload } from '@minicoze/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  CreateWorkflowDto,
  ListRunsDto,
  ListWorkflowsDto,
  RunWorkflowDto,
  SaveDraftDto,
  UpdateWorkflowDto,
  ValidateWorkflowDto,
} from './workflows.dto';
import { WorkflowsService } from './workflows.service';

@Controller('workflows')
@UseGuards(AuthGuard('jwt'))
export class WorkflowsController {
  /**
   * 注入工作流业务服务。
   * @param service 负责持久化、校验和同步执行的工作流服务。
   */
  constructor(private readonly service: WorkflowsService) {}

  /**
   * 创建当前登录用户下的空白工作流。
   * @param dto 工作流名称、可选描述和个人 workspace ID。
   * @returns 新建工作流详情，draftDefinition 和 currentVersionId 为 null。
   */
  @Post()
  create(
    @Body() dto: CreateWorkflowDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.create(dto, user.id);
  }

  /**
   * 分页查询工作流列表，默认排除已归档项。
   * @param dto 分页参数、可选名称关键词和状态筛选条件。
   * @returns 列表项、总数、页码和每页数量，列表项包含节点数。
   */
  @Get()
  list(
    @Query() dto: ListWorkflowsDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.list(dto, user.id);
  }

  /**
   * 加载工作流详情及已保存的画布草稿。
   * @param id 路径中的工作流 ID。
   * @returns 工作流详情和 draftDefinition。
   * @throws NotFoundException 工作流不存在、已归档或不属于当前身份。
   */
  @Get(':id')
  detail(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.detail(id, user.id);
  }

  /**
   * 修改工作流名称或描述。
   * @param id 路径中的工作流 ID。
   * @param dto 待更新的可选名称和描述。
   * @returns 工作流 ID 和更新时间。
   */
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateWorkflowDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(id, dto, user.id);
  }

  /**
   * 保存画布草稿，只检查基础结构，允许图或节点配置尚未完成。
   * @param id 路径中的工作流 ID。
   * @param dto 包含 WorkflowDefinition 的请求体，UI 字段原样保留。
   * @returns 工作流 ID 和更新时间。
   */
  @Put(':id/draft')
  save(
    @Param('id') id: string,
    @Body() dto: SaveDraftDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.save(id, dto.definition, user.id);
  }

  /**
   * 将工作流软删除为 ARCHIVED。
   * @param id 路径中的工作流 ID。
   * @returns 无响应体，成功时 HTTP 状态为 204。
   */
  @Delete(':id')
  @HttpCode(204)
  archive(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.archive(id, user.id);
  }

  /**
   * 校验指定定义；未传定义时校验已保存的草稿。
   * @param id 路径中的工作流 ID。
   * @param dto 可选的 definition，不会覆盖数据库中的草稿。
   * @returns valid 和可定位到节点、连线、字段的 errors，业务校验失败仍为 200。
   */
  @Post(':id/validate')
  @HttpCode(200)
  validate(
    @Param('id') id: string,
    @Body() dto: ValidateWorkflowDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.validate(id, dto.definition, user.id);
  }

  /**
   * 同步执行已保存草稿，返回并持久化节点结果。
   * @param id 路径中的工作流 ID。
   * @param dto 包含 Start 节点输入映射的请求体。
   * @returns runId、终态、最终输出、节点结果和错误；执行失败仍为 200。
   * @throws BadRequestException 输入缺失或类型错误（400）。
   * @throws UnprocessableEntityException 草稿未通过完整校验（422）。
   */
  @Post(':id/run')
  @HttpCode(200)
  run(
    @Param('id') id: string,
    @Body() dto: RunWorkflowDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.run(id, dto.input, user.id);
  }

  /**
   * 分页查询运行历史，最新的在前。
   * @param id 路径中的工作流 ID。
   * @param dto 页码和每页数量。
   * @returns items、total、page、size；列表项含 runId、状态、输入输出、节点结果和起止时间。
   * @throws NotFoundException 工作流不存在、已归档或不属于当前身份。
   */
  @Get(':id/runs')
  runs(
    @Param('id') id: string,
    @Query() dto: ListRunsDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.runs(id, dto.page, dto.size, user.id);
  }
}
