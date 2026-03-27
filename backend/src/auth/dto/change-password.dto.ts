import { IsString, IsNotEmpty, IsOptional, IsBoolean, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @ApiProperty({ example: 'NewP@ssw0rd!' })
  @IsString()
  @MinLength(8)
  newPassword: string;

  @ApiProperty({ example: 'NewP@ssw0rd!' })
  @IsString()
  confirmPassword: string;

  @ApiPropertyOptional({ description: 'Logout all other devices after password change', default: false })
  @IsOptional()
  @IsBoolean()
  logoutAllDevices?: boolean;
}
