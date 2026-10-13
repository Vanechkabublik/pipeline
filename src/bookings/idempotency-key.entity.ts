import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/**
 * Сохранённый ответ на POST /bookings по заголовку Idempotency-Key.
 * Если клиент повторит запрос (например, после обрыва сети), он получит
 * тот же ответ, а вторая бронь не создастся.
 */
@Entity('idempotency_keys')
export class IdempotencyKey {
  @PrimaryColumn('uuid')
  key: string;

  @Column('uuid')
  userId: string;

  // sha256 от тела запроса: по нему отличаем «тот же запрос» от «другого запроса с тем же ключом»
  @Column()
  requestHash: string;

  @Column({ type: 'int' })
  responseStatus: number;

  @Column({ type: 'jsonb' })
  responseBody: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
