import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  Req,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { UsersService } from '../../users/users.service';
import { CurrentUser } from '../decorators/current-user.decorator';
import { User } from '../../users/entities/user.entity';
import { UpdateProfileDto } from '../dto/auth.dto';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UserController {
  constructor(private readonly usersService: UsersService) {}

  // ─── Get own profile ──────────────────────────────────────────────────────
  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  getMe(@CurrentUser() user: User) {
    return this.usersService.getProfile(user.id);
  }

  // ─── Update profile ───────────────────────────────────────────────────────
  @Put('me')
  @ApiOperation({ summary: 'Update current user profile' })
  updateMe(@CurrentUser() user: User, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.id, dto);
  }

  // ─── Deactivate account ───────────────────────────────────────────────────
  @Post('me/deactivate')
  @ApiOperation({ summary: 'Deactivate account (mark for deletion)' })
  deactivate(@CurrentUser() user: User, @Req() req: Request) {
    return this.usersService.deactivateAccount(user.id);
  }

  // ─── Upload avatar ────────────────────────────────────────────────────────
  @Post('me/avatar')
  @ApiOperation({ summary: 'Upload profile picture' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  uploadAvatar(
    @CurrentUser() user: User,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5MB
          new FileTypeValidator({ fileType: /image\/(jpeg|png|gif|webp)/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.usersService.uploadAvatar(user.id, file);
  }

  // ─── Delete avatar ────────────────────────────────────────────────────────
  @Delete('me/avatar')
  @ApiOperation({ summary: 'Delete profile picture' })
  deleteAvatar(@CurrentUser() user: User) {
    return this.usersService.deleteAvatar(user.id);
  }
}
