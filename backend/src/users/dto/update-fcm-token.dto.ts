import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class UpdateFcmTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  fcmToken: string;
}
