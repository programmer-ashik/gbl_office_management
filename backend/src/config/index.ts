import 'reflect-metadata';
import dotenv from 'dotenv';
import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
  validateSync,
} from 'class-validator';

enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsOptional()
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => parseInt(String(value), 10))
  @IsNumber()
  PORT = 3000;

  @IsOptional()
  @IsString()
  MONGODB_URI = 'mongodb://localhost:27017/gbl_office?replicaSet=rs0';

  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) => value === true || value === 'true',
  )
  @IsBoolean()
  MONGODB_MEMORY = false;

  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @MinLength(32)
  JWT_REFRESH_SECRET!: string;

  @IsOptional()
  @IsString()
  JWT_ACCESS_EXPIRES_IN = '15m';

  @IsOptional()
  @IsString()
  JWT_REFRESH_EXPIRES_IN = '7d';

  @IsOptional()
  @IsString()
  CORS_ORIGIN = 'http://localhost:5173,http://localhost:5174';

  @IsOptional()
  @IsString()
  BOOTSTRAP_ADMIN_EMAIL?: string;

  @IsOptional()
  @IsString()
  BOOTSTRAP_ADMIN_PASSWORD?: string;
}

export type AppConfig = {
  nodeEnv: string;
  port: number;
  mongodb: {
    uri: string;
    memory: boolean;
  };
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessExpiresIn: string;
    refreshExpiresIn: string;
  };
  corsOrigins: string[];
  bootstrapAdmin: {
    email?: string;
    password?: string;
  };
};

let cached: AppConfig | undefined;

export function loadConfig(): AppConfig {
  dotenv.config();

  const validated = plainToInstance(EnvironmentVariables, process.env, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, {
    skipMissingProperties: false,
    whitelist: true,
    forbidUnknownValues: false,
  });

  if (errors.length > 0) {
    throw new Error(
      `Invalid environment configuration: ${errors
        .map((error) => Object.values(error.constraints ?? {}).join(', '))
        .join('; ')}`,
    );
  }

  cached = {
    nodeEnv: validated.NODE_ENV,
    port: validated.PORT,
    mongodb: {
      uri: validated.MONGODB_URI,
      memory: validated.MONGODB_MEMORY,
    },
    jwt: {
      accessSecret: validated.JWT_ACCESS_SECRET,
      refreshSecret: validated.JWT_REFRESH_SECRET,
      accessExpiresIn: validated.JWT_ACCESS_EXPIRES_IN,
      refreshExpiresIn: validated.JWT_REFRESH_EXPIRES_IN,
    },
    corsOrigins: validated.CORS_ORIGIN.split(',').map((origin) =>
      origin.trim(),
    ),
    bootstrapAdmin: {
      email: validated.BOOTSTRAP_ADMIN_EMAIL,
      password: validated.BOOTSTRAP_ADMIN_PASSWORD,
    },
  };

  return cached;
}

export function getConfig(): AppConfig {
  return cached ?? loadConfig();
}
