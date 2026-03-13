import { IsOptional, IsBoolean } from 'class-validator';

export class UpdateNotificationPreferencesDto {
  @IsOptional()
  @IsBoolean()
  notificationEmailEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  notificationPushEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  notificationInAppEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  notificationSecurityEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  notificationOrderEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  notificationPromotionEnabled?: boolean;
}

export class UpdatePrivacySettingsDto {
  @IsOptional()
  @IsBoolean()
  profilePublic?: boolean;

  @IsOptional()
  @IsBoolean()
  showEmail?: boolean;

  @IsOptional()
  @IsBoolean()
  showPhone?: boolean;

  @IsOptional()
  @IsBoolean()
  showActivityStatus?: boolean;
}
