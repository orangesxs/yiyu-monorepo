import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query, Res } from '@nestjs/common'
import type { Response } from 'express'
import { AgentService } from './agent.service'
import { AgentExecutorService, ExecutorEntry, PageContext } from './agent-executor.service'
import { AgentConfigService } from './agent-config.service'
import { SseStream } from './sse'
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import type { User } from '@prisma/client'

class ChatDto {
  @IsString()
  @MaxLength(2000)
  content!: string

  @IsOptional()
  @IsObject()
  pageContext?: PageContext
}

/** Agent 用户端:会话 CRUD + SSE 对话(chat/confirm/regenerate) */
@Controller('agent/v1')
export class AgentController {
  constructor(
    private agent: AgentService,
    private executor: AgentExecutorService,
    private config: AgentConfigService,
  ) {}

  @Get('status')
  async status() {
    const [llm, settings] = await Promise.all([this.config.getLlmConfig(), this.config.getSettings()])
    return { llmConfigured: !!llm, agentEnabled: settings.agentEnabled }
  }

  /* ── 会话管理(普通 envelope) ── */

  @Get('conversations')
  listConversations(@CurrentUser() user: User) {
    return this.agent.listConversations(user.id)
  }

  @Post('conversations')
  createConversation(@CurrentUser() user: User) {
    return this.agent.createConversation({ id: user.id, nickname: user.nickname })
  }

  @Delete('conversations/:id')
  deleteConversation(@CurrentUser() user: User, @Param('id') id: string) {
    return this.agent.deleteConversation(user.id, id)
  }

  @Get('conversations/:id/messages')
  listMessages(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('pageSize', new ParseIntPipe({ optional: true })) pageSize = 50,
  ) {
    return this.agent.listMessages(user.id, id, Math.min(page, 999), Math.min(Math.max(pageSize, 1), 100))
  }

  /* ── SSE 对话(注入 @Res 绕过 envelope;流前错误仍走 AllExceptionsFilter) ── */

  @Post('conversations/:id/chat')
  async chat(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: ChatDto,
    @Res() res: Response,
  ) {
    const sse = new SseStream(res)
    const entry: ExecutorEntry = { type: 'chat', content: dto.content.trim(), pageContext: dto.pageContext }
    await this.executor.run(user, id, entry, sse)
  }

  @Post('confirms/:confirmId/confirm')
  async confirm(@CurrentUser() user: User, @Param('confirmId') confirmId: string, @Res() res: Response) {
    const sse = new SseStream(res)
    // confirmId 携带在卡片 content,先按最近的 confirm_card 查会话归属
    const msg = await this.agentServiceFindConversationByConfirm(user.id, confirmId)
    if (!msg) {
      sse.emit('error', { code: 404, message: '确认卡不存在' })
      sse.emit('done', { conversationId: '', finish: 'error' })
      sse.close()
      return
    }
    const entry: ExecutorEntry = { type: 'confirm', confirmId }
    await this.executor.run(user, msg.conversationId, entry, sse)
  }

  @Post('confirms/:confirmId/cancel')
  async cancelConfirm(@CurrentUser() user: User, @Param('confirmId') confirmId: string) {
    return this.agent.cancelConfirmCard(user.id, confirmId)
  }

  @Post('conversations/:id/regenerate')
  async regenerate(@CurrentUser() user: User, @Param('id') id: string, @Res() res: Response) {
    const sse = new SseStream(res)
    const entry: ExecutorEntry = { type: 'regenerate' }
    await this.executor.run(user, id, entry, sse)
  }

  /** 按 confirmId 找会话(校验属主):扫用户最近 confirm_card 消息 */
  private async agentServiceFindConversationByConfirm(userId: string, confirmId: string) {
    return this.agent.findByConfirmId(userId, confirmId)
  }
}
