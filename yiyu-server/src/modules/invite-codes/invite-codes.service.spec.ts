import { BadRequestException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { InviteCodesService } from './invite-codes.service'
import { PrismaService } from '../../prisma/prisma.service'

/** 单测:邀请码额度与生成(mock prisma,不触库) */
describe('InviteCodesService', () => {
  let service: InviteCodesService
  let prisma: {
    inviteCode: {
      count: jest.Mock
      findUnique: jest.Mock
      create: jest.Mock
      findMany: jest.Mock
    }
  }

  beforeEach(async () => {
    prisma = {
      inviteCode: {
        count: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
      },
    }
    const ref = await Test.createTestingModule({
      providers: [
        InviteCodesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile()
    service = ref.get(InviteCodesService)
  })

  it('普通用户未用码达到上限(5)→ 拒绝生成', async () => {
    prisma.inviteCode.count.mockResolvedValue(5)
    await expect(service.create('u1', false)).rejects.toThrow(BadRequestException)
    expect(prisma.inviteCode.create).not.toHaveBeenCalled()
  })

  it('管理员不受额度限制', async () => {
    prisma.inviteCode.count.mockResolvedValue(99)
    prisma.inviteCode.findUnique.mockResolvedValue(null)
    prisma.inviteCode.create.mockImplementation(({ data }: any) => ({
      id: 'new-id',
      code: data.code,
      createdAt: new Date(),
      usedAt: null,
    }))
    const vo = await service.create('u1', true)
    expect(vo.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/)
  })

  it('码值撞车自动重试', async () => {
    prisma.inviteCode.findUnique
      .mockResolvedValueOnce({ id: 'x' }) // 第一次撞
      .mockResolvedValue(null) // 第二次可用
    prisma.inviteCode.create.mockImplementation(({ data }: any) => ({
      id: 'new-id',
      code: data.code,
      createdAt: new Date(),
      usedAt: null,
    }))
    const vo = await service.create('u1', false)
    expect(vo.code).toHaveLength(8)
    expect(prisma.inviteCode.findUnique).toHaveBeenCalledTimes(2)
  })
})
