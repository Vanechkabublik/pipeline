import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

// Сохранённый ответ на POST /bookings: повтор с тем же ключом вернёт его же
@Entity('idempotency_keys')
export class IdempotencyKey {
  @PrimaryColumn('uuid')
  key: string;

  @Column('uuid')
  userId: string;

  @Column()
  requestHash: string;

  @Column({ type: 'int' })
  responseStatus: number;

  @Column({ type: 'jsonb' })
  responseBody: object;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
