import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { AdminService } from './admin.service'
import { AdminCreateUserDto, AdminUpdateUserDto, QueryLogsDto } from './dto/admin.dto'
import { AdminGuard } from '../../common/guards/admin.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import type { User } from '@prisma/client'

/** 管理后台:全部路由 requiresAdmin(AdminGuard:JWT + role 校验) */
@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private admin: AdminService) {}

  /* ── 用户管理 ── */
  @Get('users')
  listUsers(
    @Query('keyword') keyword?: string,
    @Query('role') role?: string,
    @Query('status') status?: string,
  ) {
    return this.admin.listUsers({ keyword, role, status })
  }

  @Post('users')
  createUser(@CurrentUser() user: User, @Body() dto: AdminCreateUserDto) {
    return this.admin.createUser(user.id, dto)
  }

  @Patch('users/:id')
  updateUser(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: AdminUpdateUserDto,
  ) {
    return this.admin.updateUser(user.id, id, dto)
  }

  /* ── 系统日志 ── */
  @Get('logs')
  listLogs(@Query() query: QueryLogsDto) {
    return this.admin.listLogs(query)
  }

  /* ── 邀请码 ── */
  @Get('invite-codes')
  listAllInvites() {
    return this.admin.listAllInvites()
  }

  @Post('invite-codes')
  createInvite(@CurrentUser() user: User) {
    return this.admin.createInvite(user.id)
  }

  /* ── 数据概览 ── */
  @Get('dashboard')
  dashboard() {
    return this.admin.dashboard()
  }
}
