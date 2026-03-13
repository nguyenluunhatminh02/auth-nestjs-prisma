import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { User } from './user.entity';

/**
 * Role entity
 * Represents user roles in the system with enum-based validation
 */
@Entity('roles')
export class Role {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Role name - validated against Role enum
   */
  @Column({
    type: 'enum',
    enum: ['ADMIN', 'USER', 'MODERATOR'],
    unique: true,
  })
  name: string;

  /**
   * Users associated with this role
   */
  @OneToMany(() => User, (user) => user.roles)
  users: User[];
}
