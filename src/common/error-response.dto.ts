import { ApiProperty } from '@nestjs/swagger';

/** Формат любой ошибки API — используется в @ApiResponse для Swagger */
export class ErrorResponseDto {
  @ApiProperty({ example: 409 })
  statusCode: number;

  @ApiProperty({
    example: 'BOX_SOLD_OUT',
    description: 'Машиночитаемый код ошибки',
  })
  code: string;

  @ApiProperty({ example: 'Бокс закончился' })
  message: string;

  @ApiProperty({
    example: null,
    nullable: true,
    description:
      'Подробности. Для VALIDATION_ERROR — ошибки по полям: { "price": ["..."] }',
  })
  details: unknown;

  @ApiProperty({ example: '/bookings' })
  path: string;

  @ApiProperty({ example: '2026-01-01T12:00:00.000Z' })
  timestamp: string;
}
