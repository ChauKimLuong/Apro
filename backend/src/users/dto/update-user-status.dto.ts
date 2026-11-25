import { IsIn } from 'class-validator';

export class UpdateUserStatusDto {
  @IsIn(['ACTIVE', 'LOCKED'], {
    message: 'Trạng thái phải là ACTIVE hoặc LOCKED',
  })
  status!: 'ACTIVE' | 'LOCKED';
}
