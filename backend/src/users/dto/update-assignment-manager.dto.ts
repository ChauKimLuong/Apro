import { Type } from 'class-transformer';
import { IsUUID, ValidateIf } from 'class-validator';

export class UpdateAssignmentManagerDto {
  @Type(() => Object)
  @ValidateIf((_body: unknown, value: unknown) => value !== null)
  @IsUUID('4', { message: 'Vui lòng chọn lại phân công của người quản lý.' })
  managerAssignmentId!: string | null;
}
