import { PickType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { CreateFormTemplateDto } from './create-form-template.dto';

export class UpdateFormTemplateDraftDto extends PickType(
  CreateFormTemplateDto,
  ['name', 'fields', 'targetOrganizationalUnitId'] as const,
) {
  @Type(() => Object)
  @IsInt()
  @Min(1)
  @Max(2_147_483_646)
  expectedVersion!: number;
}
