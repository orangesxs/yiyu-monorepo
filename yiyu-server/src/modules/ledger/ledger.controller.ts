import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { LedgerService } from './ledger.service'
import {
  CreateBookDto,
  CreateCategoryDto,
  CreateTransactionDto,
  QueryTransactionsDto,
  UpdateTransactionDto,
} from './dto/ledger.dto'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import type { User } from '@prisma/client'

/**
 * 记账本域:/api/ledger/*。
 * 资源按名词复数组织(books/categories/transactions/reports),模块前缀划分应用边界。
 */
@Controller('ledger')
export class LedgerController {
  constructor(private ledger: LedgerService) {}

  /* ── 账本 ── */
  @Get('books')
  listBooks(@CurrentUser() user: User) {
    return this.ledger.listBooks(user.id)
  }

  @Post('books')
  createBook(@CurrentUser() user: User, @Body() dto: CreateBookDto) {
    return this.ledger.createBook(user.id, dto)
  }

  /* ── 分类 ── */
  /** type 省略时一次返回两套:{expense: CategoryVo[], income: CategoryVo[]} */
  @Get('categories')
  listCategories(@CurrentUser() user: User, @Query('type') type?: 'expense' | 'income') {
    return this.ledger.listCategories(user.id, type)
  }

  @Post('categories')
  createCategory(@CurrentUser() user: User, @Body() dto: CreateCategoryDto) {
    return this.ledger.createCategory(user.id, dto)
  }

  @Delete('categories/:id')
  removeCategory(@CurrentUser() user: User, @Param('id') id: string) {
    return this.ledger.removeCategory(user.id, id)
  }

  /* ── 流水(分页) ── */
  @Get('transactions')
  listTransactions(@CurrentUser() user: User, @Query() query: QueryTransactionsDto) {
    return this.ledger.listTransactions(user.id, query)
  }

  @Post('transactions')
  createTransaction(@CurrentUser() user: User, @Body() dto: CreateTransactionDto) {
    return this.ledger.createTransaction(user.id, dto)
  }

  @Patch('transactions/:id')
  updateTransaction(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateTransactionDto,
  ) {
    return this.ledger.updateTransaction(user.id, id, dto)
  }

  @Delete('transactions/:id')
  removeTransaction(@CurrentUser() user: User, @Param('id') id: string) {
    return this.ledger.removeTransaction(user.id, id)
  }

  /* ── 报表聚合(服务端计算) ── */
  @Get('reports')
  reports(
    @CurrentUser() user: User,
    @Query('bookId') bookId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.ledger.reports(user.id, { bookId, from, to })
  }
}
