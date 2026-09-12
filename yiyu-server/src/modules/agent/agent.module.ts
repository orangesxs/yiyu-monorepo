import { Module } from '@nestjs/common'
import { LedgerModule } from '../ledger/ledger.module'
import { UsersModule } from '../users/users.module'
import { InviteCodesModule } from '../invite-codes/invite-codes.module'
import { PortalModule } from '../portal/portal.module'
import { AgentConfigService } from './agent-config.service'
import { LlmClient } from './llm-client'
import { UsageService } from './usage.service'
import { SkillRegistry } from './skill-registry'
import { AgentService } from './agent.service'
import { AgentExecutorService } from './agent-executor.service'
import { ContextBuilder } from './context-builder'
import { AgentController } from './agent.controller'
import { AgentAdminController } from './agent-admin.controller'
import { SkillsLedger } from './skills/skills.ledger'
import { SkillsProfile } from './skills/skills.profile'
import { SkillsCommon } from './skills/skills.common'

/**
 * AI 助手(agent):平台级模块。
 * 会话/消息/SSE 对话循环 + 技能注册表(各业务模块声明自己的技能) + LLM 用量统计。
 */
@Module({
  imports: [LedgerModule, UsersModule, InviteCodesModule, PortalModule],
  controllers: [AgentController, AgentAdminController],
  providers: [
    AgentConfigService,
    LlmClient,
    UsageService,
    SkillRegistry,
    AgentService,
    AgentExecutorService,
    ContextBuilder,
    SkillsLedger,
    SkillsProfile,
    SkillsCommon,
  ],
})
export class AgentModule {}
