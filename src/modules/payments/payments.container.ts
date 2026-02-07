import { container } from 'tsyringe';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';

// Register services
container.registerSingleton(PaymentsService);

// Register controllers
container.registerSingleton(PaymentsController);