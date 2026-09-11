import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator'
import type { ValidationOptions } from 'class-validator'
import { registerDecorator } from 'class-validator'
import { Type } from 'class-transformer'

/**
 * 金额校验:正数、最多两位小数。
 * 自定义 validator(JSON number 无法用 Matches 正则,9.123 才是目标拦截对象)。
 */
export function IsAmount(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isAmount',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'number' || !Number.isFinite(value)) return false
          return value > 0 && Math.round(value * 100) === value * 100 && value <= 99_999_999
        },
        defaultMessage: () => '金额需大于 0 且最多两位小数',
      },
    })
  }
}

/** POST /ledger/books */
export class CreateBookDto {
  @IsString()
  @Length(1, 20, { message: '账本名需 1-20 个字符' })
  name: string

  @IsString()
  @MaxLength(8, { message: '图标 emoji 过长' })
  icon: string
}

/** POST /ledger/categories */
export class CreateCategoryDto {
  @IsIn(['expense', 'income'], { message: '分类类型非法' })
  type: 'expense' | 'income'

  @IsString()
  @Length(1, 10, { message: '分类名需 1-10 个字符' })
  name: string

  @IsString()
  @MaxLength(8, { message: '图标 emoji 过长' })
  icon: string
}

/** GET /ledger/transactions 查询参数(分页 + 时间区间 + 筛选) */
export class QueryTransactionsDto {
  @IsString()
  bookId: string

  @IsOptional()
  @IsString()
  from?: string

  @IsOptional()
  @IsString()
  to?: string

  @IsOptional()
  @IsIn(['expense', 'income'], { message: '流水类型非法' })
  type?: 'expense' | 'income'

  @IsOptional()
  @IsString()
  categoryId?: string

  @IsOptional()
  @IsString()
  @MaxLength(60, { message: '关键词最多 60 字' })
  keyword?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page 需为整数' })
  @Min(1, { message: 'page 最小为 1' })
  page?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pageSize 需为整数' })
  @Min(1, { message: 'pageSize 最小为 1' })
  @Max(100, { message: 'pageSize 最大为 100' })
  pageSize?: number
}

/** POST /ledger/transactions */
export class CreateTransactionDto {
  @IsIn(['expense', 'income'], { message: '流水类型非法' })
  type: 'expense' | 'income'

  @IsAmount()
  amount: number

  @IsString()
  @MinLength(1, { message: '请选择分类' })
  categoryId: string

  /** 'YYYY-MM-DD HH:mm' */
  @IsString()
  date: string

  @IsOptional()
  @IsString()
  @MaxLength(60, { message: '备注最多 60 字' })
  note?: string

  @IsOptional()
  @IsString()
  bookId?: string
}

/** PATCH /ledger/transactions/:id(全字段可选) */
export class UpdateTransactionDto {
  @IsOptional()
  @IsIn(['expense', 'income'], { message: '流水类型非法' })
  type?: 'expense' | 'income'

  @IsOptional()
  @IsAmount()
  amount?: number

  @IsOptional()
  @IsString()
  categoryId?: string

  @IsOptional()
  @IsString()
  date?: string

  @IsOptional()
  @IsString()
  @MaxLength(60, { message: '备注最多 60 字' })
  note?: string

  @IsOptional()
  @IsString()
  bookId?: string
}
