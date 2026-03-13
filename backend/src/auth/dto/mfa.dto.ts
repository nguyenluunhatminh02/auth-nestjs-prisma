import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MfaVerifyDto {
  @ApiProperty({ description: '6-digit TOTP code', example: '123456' })
  @IsNotEmpty()
  @IsString()
  code: string;
}

export class MfaLoginDto {
  @ApiProperty({ description: 'Temporary MFA token from login response' })
  @IsNotEmpty()
  @IsString()
  mfaTempToken: string;

  @ApiProperty({ description: '6-digit TOTP code', example: '123456' })
  @IsNotEmpty()
  @IsString()
  code: string;
}
