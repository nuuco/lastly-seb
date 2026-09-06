import { Global, Module } from '@nestjs/common';

import { CadenceService } from './cadence.service';

@Global()
@Module({ providers: [CadenceService], exports: [CadenceService] })
export class CadenceModule {}
