import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

const PASSWORD_RULES = {
  min: 8,
  max: 72,
  pattern: /^(?=.*[A-Za-z])(?=.*\d).+$/,
  message: 'Password must contain at least one letter and one number',
} as const;

export class ResetUserPasswordDto {
  @IsString()
  @MinLength(PASSWORD_RULES.min)
  @MaxLength(PASSWORD_RULES.max)
  @Matches(PASSWORD_RULES.pattern, { message: PASSWORD_RULES.message })
  newPassword!: string;
}

export class ChangeOwnPasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(PASSWORD_RULES.max)
  oldPassword!: string;

  @IsString()
  @MinLength(PASSWORD_RULES.min)
  @MaxLength(PASSWORD_RULES.max)
  @Matches(PASSWORD_RULES.pattern, { message: PASSWORD_RULES.message })
  newPassword!: string;
}

export { PASSWORD_RULES };
