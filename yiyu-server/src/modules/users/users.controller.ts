import { Body, Controller, Get, Put } from '@nestjs/common'
import { UsersService } from './users.service'
import { ChangePasswordDto, UpdateProfileDto } from './dto/profile.dto'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import type { User } from '@prisma/client'

@Controller('profile')
export class UsersController {
  constructor(private users: UsersService) {}

  @Get()
  getProfile(@CurrentUser() user: User) {
    return this.users.getProfile(user.id)
  }

  @Put()
  updateProfile(@CurrentUser() user: User, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user.id, dto)
  }

  @Put('password')
  changePassword(@CurrentUser() user: User, @Body() dto: ChangePasswordDto) {
    return this.users.changePassword(user.id, dto)
  }
}
