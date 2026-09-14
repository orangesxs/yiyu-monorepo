import { IsIn, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator'

/** GET /admin/logs 查询参数 */
export class QueryLogsDto {
  @IsOptional()
  @IsIn(['auth', 'ledger', 'profile', 'admin', 'agent'], { message: '模块筛选非法' })
  module?: string

  @IsOptional()
  @IsIn(['login', 'create', 'update', 'delete', 'security'], { message: '操作类型筛选非法' })
  action?: string

  @IsOptional()
  @IsString()
  operatorId?: string

  @IsOptional()
  @IsString()
  page?: string

  @IsOptional()
  @IsString()
  pageSize?: string
}

/** POST /admin/users:管理员直接建号(无需邀请码) */
export class AdminCreateUserDto {
  @IsString()
  @Length(2, 20, { message: '用户名需 2-20 个字符' })
  @Matches(/^[a-zA-Z0-9_]+$/, { message: '用户名仅支持字母、数字、下划线' })
  username: string

  @IsString()
  @Length(1, 20, { message: '昵称需 1-20 个字符' })
  name: string

  @IsString()
  @MaxLength(8, { message: '头像 emoji 过长' })
  avatar: string

  @IsIn(['admin', 'user'], { message: '角色非法' })
  role: 'admin' | 'user'

  @IsString()
  @Length(6, 64, { message: '初始密码至少 6 位' })
  password: string
}

/** PATCH /admin/users/:id */
export class AdminUpdateUserDto {
  @IsOptional()
  @IsIn(['admin', 'user'], { message: '角色非法' })
  role?: 'admin' | 'user'

  @IsOptional()
  @IsIn(['active', 'disabled'], { message: '状态非法' })
  status?: 'active' | 'disabled'
}

/** POST /admin/users/:id/reset-password:管理员重置用户密码 */
export class AdminResetPasswordDto {
  @IsString()
  @Length(6, 64, { message: '新密码至少 6 位' })
  password: string
}
