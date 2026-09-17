import { Global, Module } from '@nestjs/common';

import { CadenceService } from './cadence.service';
import { PriorsRepository } from './priors.repository';

@Global()
@Module({
  providers: [CadenceService, PriorsRepository],
  exports: [CadenceService, PriorsRepository],
})
export class CadenceModule {}
