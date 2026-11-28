import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class SubmitFormTemplateDraftDto {
  @Type(() => Object)
  @IsInt({ message: 'Phiên bản mẫu phải là số nguyên.' })
  @Min(1, { message: 'Phiên bản mẫu phải lớn hơn 0.' })
  @Max(2_147_483_647, { message: 'Phiên bản mẫu không hợp lệ.' })
  expectedVersion!: number;
}
