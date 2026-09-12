import { Type } from 'class-transformer'
import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'

export class LlmConfigPartDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  baseUrl?: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  apiKey?: string // 空串/缺省 = 保留旧值

  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string

  @IsOptional()
  @IsBoolean()
  streaming?: boolean
}

export class PersonaPartDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  systemPrompt?: string
}

export class SettingsPartDto {
  @IsOptional()
  @IsBoolean()
  agentEnabled?: boolean

  @IsOptional()
  @IsInt()
  @Min(4)
  @Max(100)
  contextTurns?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxToolRounds?: number
}

/** PUT /agent/v1/admin/config 部分更新(三段任意一段可选) */
export class UpdateAgentConfigDto {
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => LlmConfigPartDto)
  llm?: LlmConfigPartDto

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => PersonaPartDto)
  persona?: PersonaPartDto

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => SettingsPartDto)
  settings?: SettingsPartDto
}

/** PUT /agent/v1/admin/skills/:name 启停 */
export class UpdateSkillDto {
  @IsBoolean()
  enabled!: boolean
}

/** POST /agent/v1/admin/config/test 可携带表单值(未保存也能测) */
export class TestConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  baseUrl?: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  apiKey?: string // 空=用已保存的

  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string
}

/** POST /agent/v1/conversations/:id/chat */
export class ChatDto {
  @IsString()
  @MaxLength(2000)
  content!: string

  @IsOptional()
  @IsObject()
  pageContext?: { app: string; title: string; hint?: string }
}
