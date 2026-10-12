import { ValidationPipe } from '@nestjs/common';
import { RequestValidationException } from '../exceptions/request-validation.exception';

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: {
      enableImplicitConversion: true,
    },
    errorHttpStatusCode: 400,
    stopAtFirstError: true,
    exceptionFactory: (errors) => new RequestValidationException(errors),
  });
}
