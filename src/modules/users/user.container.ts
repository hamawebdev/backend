import { container } from 'tsyringe';
import UserRepository from './user.repository';
import IUserRepository from './interfaces/IUserRepository';

// Register user repository
container.register<IUserRepository>('IUserRepository', {
  useClass: UserRepository
});

export { container }; 