import { Body, Controller, Get, NotFoundException, Param, Post, Put, Query, UseGuards } from '@nestjs/common'
import { AgentConfigService } from './agent-config.service'
import { UsageService } from './usage.service'
import { LlmClient } from './llm-client'
import { SkillRegistry } from './skill-registry'
import { UpdateAgentConfigDto, UpdateSkillDto, TestConfigDto } from './dto/agent.dto'
import { AdminGuard } from '../../common/guards/admin.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { AuditService } from '../../common/audit/audit.service'
import type { User } from '@prisma/client'

/** Agent 管理端:配置/技能/用量,全部 requiresAdmin */
@Controller('agent/v1/admin')
@UseGuards(AdminGuard)
export class AgentAdminController {
  constructor(
    private config: AgentConfigService,
    private llm: LlmClient,
    private usage: UsageService,
    private registry: SkillRegistry,
    private audit: AuditService,
  ) {}

  @Get('config')
  async getConfig() {
    const [llm, persona, settings] = await Promise.all([
      this.config.getMaskedLlmConfig(),
      this.config.getPersona(),
      this.config.getSettings(),
    ])
    return { llm, persona, settings }
  }

  @Put('config')
  async updateConfig(@CurrentUser() user: User, @Body() dto: UpdateAgentConfigDto) {
    await this.config.updateConfig(user.username, dto)
    await this.audit.record('agent', 'update', user.id, '修改 AI 配置')
    return { ok: true }
  }

  /** 连通测试:可携带表单值(未保存也能测);缺省用已保存配置 */
  @Post('config/test')
  async testConnection(@CurrentUser() user: User, @Body() dto: TestConfigDto) {
    const started = Date.now()
    try {
      const res = await this.llm.chat([{ role: 'user', content: '只回复:ok' }], {
        maxTokens: 16,
        ...(dto.baseUrl && dto.apiKey ? { baseUrl: dto.baseUrl, apiKey: dto.apiKey } : {}),
      })
      void this.usage.record({
        userId: user.id,
        kind: 'test',
        model: res.model,
        usage: res.usage,
        latencyMs: res.latencyMs,
        ok: true,
      })
      return { ok: true, latencyMs: Date.now() - started, model: res.model, message: '连接成功' }
    } catch (e) {
      const err = e as { code?: number; message?: string }
      void this.usage.record({
        userId: user.id,
        kind: 'test',
        model: '',
        usage: { promptTokens: 0, completionTokens: 0, estimated: true },
        latencyMs: Date.now() - started,
        ok: false,
        errorCode: String(err.code ?? ''),
      })
      const msg =
        err.code === 503 ? '请先填写 Base URL 和 API Key' : err.code === 401 ? 'API Key 无效或无权限' : err.code === 400 ? err.message || '参数错误' : err.message || '连接失败'
      return { ok: false, latencyMs: Date.now() - started, model: '', message: msg }
    }
  }

  /** 模型列表:OpenAI 兼容 GET /models;可携带表单值未保存探测 */
  @Post('config/models')
  async listModels(@Body() dto: TestConfigDto) {
    try {
      const models = await this.llm.listModels({
        ...(dto.baseUrl ? { baseUrl: dto.baseUrl } : {}),
        ...(dto.apiKey ? { apiKey: dto.apiKey } : {}),
      })
      return { ok: true, models }
    } catch (e) {
      const err = e as { message?: string }
      return { ok: false, models: [] as string[], message: err.message || '获取模型列表失败' }
    }
  }

  /* ── 技能管理 ── */

  @Get('skills')
  listSkills() {
    return this.registry.listWithState()
  }

  @Put('skills/:name')
  async updateSkill(@CurrentUser() user: User, @Param('name') name: string, @Body() dto: UpdateSkillDto) {
    const ok = await this.registry.setEnabled(name, dto.enabled, user.username)
    if (!ok) throw new NotFoundException('技能不存在')
    await this.audit.record('agent', 'update', user.id, `${dto.enabled ? '启用' : '停用'}技能「${name}」`)
    return { ok: true }
  }

  @Get('usage/summary')
  usageSummary(@Query() query: { from?: string; to?: string }) {
    return this.usage.summary(query.from, query.to)
  }
}
