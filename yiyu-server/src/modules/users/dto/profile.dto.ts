import { IsIn, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator'

/** PUT /profile:改档案(昵称/头像/签名/性别/生日/地区) */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Length(1, 20, { message: '昵称需 1-20 个字符' })
  nickname?: string

  @IsOptional()
  @IsString()
  @MaxLength(8, { message: '头像 emoji 过长' })
  avatar?: string

  @IsOptional()
  @IsString()
  @MaxLength(60, { message: '个性签名最多 60 字' })
  bio?: string

  @IsOptional()
  @IsIn(['secret', 'male', 'female'], { message: '性别取值非法' })
  gender?: string

  /** 'YYYY-MM-DD' 或空串(清空);空串存 null */
  @IsOptional()
  @IsString()
  @Matches(/^(?:\d{4}-\d{2}-\d{2})?$/, { message: '生日格式应为 YYYY-MM-DD' })
  birthday?: string

  @IsOptional()
  @IsString()
  @MaxLength(30, { message: '地区最多 30 字' })
  region?: string
}

/** PUT /profile/password:改密码 */
export class ChangePasswordDto {
  @IsString()
  @Length(1, 64, { message: '请输入当前密码' })
  oldPassword: string

  @IsString()
  @Length(6, 64, { message: '新密码至少 6 位' })
  newPassword: string
}
