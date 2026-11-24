import { BadRequestException, type ValidationError } from '@nestjs/common';

export class RequestValidationException extends BadRequestException {
  constructor(errors: ValidationError[]) {
    super({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Dữ liệu gửi lên không hợp lệ',
      errors: errors.map(({ property, constraints }) => ({
        field: property,
        message: constraints?.whitelistValidation
          ? 'Trường này không được phép'
          : (Object.values(constraints ?? {})[0] ?? 'Giá trị không hợp lệ'),
      })),
    });
  }
}
