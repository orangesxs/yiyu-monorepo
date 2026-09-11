import { IsString, Length, Matches } from 'class-validator'

/** 注册 DTO(需邀请码;内部应用注册策略) */
export class RegisterDto {
  @IsString()
  @Length(2, 20, { message: '用户名需 2-20 个字符' })
  @Matches(/^[a-zA-Z0-9_]+$/, { message: '用户名仅支持字母、数字、下划线' })
  username: string

  @IsString()
  @Length(1, 20, { message: '昵称需 1-20 个字符' })
  nickname: string

  @IsString()
  @Length(6, 64, { message: '密码至少 6 位' })
  password: string

  @IsString()
  @Length(8, 8, { message: '邀请码为 8 位字符' })
  inviteCode: string
}

/** 登录 DTO */
export class LoginDto {
  @IsString()
  @Length(1, 20, { message: '请输入用户名' })
  username: string

  @IsString()
  @Length(1, 64, { message: '请输入密码' })
  password: string
}
