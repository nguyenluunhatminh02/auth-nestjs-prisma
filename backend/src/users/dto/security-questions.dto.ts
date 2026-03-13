import { IsString, IsNotEmpty, ArrayMaxSize, ArrayMinSize, ValidateNested, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

export class SecurityQuestionItemDto {
  @IsString()
  @IsNotEmpty()
  question: string;

  @IsString()
  @IsNotEmpty()
  answer: string;
}

export class SetupSecurityQuestionsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => SecurityQuestionItemDto)
  questions: SecurityQuestionItemDto[];
}
