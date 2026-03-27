import { IsOptional, IsString, IsDateString, MaxLength, IsIn } from 'class-validator';
import { Transform } from 'class-transformer';

const emptyToUndefined = ({ value }: { value: unknown }) =>
  value === '' ? undefined : value;

/** Allowlisted gender values — add more as needed */
const GENDER_VALUES = ['male', 'female', 'non-binary', 'prefer-not-to-say', 'other'] as const;

/** IANA timezone identifiers supported by the runtime */
const VALID_TIMEZONES: string[] = (() => {
  try {
    return (Intl as any).supportedValuesOf('timeZone') as string[];
  } catch {
    // Fallback for older Node versions that don't support supportedValuesOf
    return [];
  }
})();

export class UpdateProfileDto {
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(GENDER_VALUES, {
    message: `gender must be one of: ${GENDER_VALUES.join(', ')}`,
  })
  gender?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(10)
  language?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(64)
  // Validate against IANA timezone list when available; always reject obviously bad strings
  @IsIn(VALID_TIMEZONES.length ? VALID_TIMEZONES : ['UTC'], {
    message: 'timezone must be a valid IANA timezone identifier (e.g. "Asia/Ho_Chi_Minh")',
    // Skip this validator when the runtime doesn't provide a timezone list
    ...(VALID_TIMEZONES.length === 0 ? { each: false } : {}),
  })
  timezone?: string;
}
