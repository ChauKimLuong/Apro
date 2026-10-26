import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { DatabaseModule } from '../database/database.module';
import { FormTemplatesController } from './form-templates.controller';
import { FormTemplatesRepository } from './form-templates.repository';
import { FormTemplatesService } from './form-templates.service';
import { FormCreateGuard } from './guards/form-create.guard';

@Module({
  imports: [AuthModule, AuthorizationModule, DatabaseModule],
  controllers: [FormTemplatesController],
  providers: [FormTemplatesService, FormTemplatesRepository, FormCreateGuard],
})
export class FormTemplatesModule {}
