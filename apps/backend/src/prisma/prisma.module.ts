import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * @Global() 表示：这个模块注册一次，全项目任何地方都能直接注入 PrismaService，
 * 不用在每个模块里重复 imports。
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
