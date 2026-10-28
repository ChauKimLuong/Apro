import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { FieldType } from '../../generated/prisma/client';

function trimText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateFormFieldDto {
  @Type(() => Object)
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @MaxLength(64)
  @Matches(/^[a-z][a-z0-9_]*$/)
  key!: string;

  @Type(() => Object)
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  label!: string;

  @Type(() => Object)
  @IsEnum(FieldType)
  type!: FieldType;

  @Type(() => Object)
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsBoolean()
  isRequired?: boolean;

  @Type(() => Object)
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value) ? value.map(trimText) : value,
  )
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(120, { each: true })
  options?: string[];
}

export class CreateFormTemplateDto {
  @Type(() => Object)
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Z][A-Z0-9_]*$/)
  code!: string;

  @Type(() => Object)
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @Type(() => Object)
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsUUID('4', { message: 'Vui lòng chọn lại đơn vị áp dụng.' })
  targetOrganizationalUnitId?: string;

  @IsArray()
  @ArrayMaxSize(50)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => CreateFormFieldDto)
  fields!: CreateFormFieldDto[];
}
