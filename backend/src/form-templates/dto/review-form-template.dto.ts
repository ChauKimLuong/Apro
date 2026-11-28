import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class ReviewFormTemplateDto {
  @Type(() => Object)
  @IsIn(['APPROVE', 'RETURN'], { message: 'Vui lòng chọn Duyệt hoặc Trả lại.' })
  decision!: 'APPROVE' | 'RETURN';

  @Type(() => Object)
  @IsInt({ message: 'Phiên bản mẫu phải là số nguyên.' })
  @Min(1, { message: 'Phiên bản mẫu phải lớn hơn 0.' })
  @Max(2_147_483_647, { message: 'Phiên bản mẫu không hợp lệ.' })
  expectedVersion!: number;

  @Type(() => Object)
  @IsISO8601(
    { strict: true, strictSeparator: true },
    {
      message: 'Thời điểm gửi không hợp lệ. Vui lòng mở lại mẫu.',
    },
  )
  expectedSubmittedAt!: string;

  @Type(() => Object)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf(
    (dto: ReviewFormTemplateDto, value: unknown) =>
      dto.decision === 'RETURN' || value !== undefined,
  )
  @IsNotEmpty({ message: 'Vui lòng nhập góp ý khi trả lại mẫu.' })
  @IsString({ message: 'Góp ý phải là văn bản.' })
  @MaxLength(1000, { message: 'Góp ý tối đa 1000 ký tự.' })
  comment?: string;
}
