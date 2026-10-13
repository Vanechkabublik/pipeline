import { ApiProperty } from '@nestjs/swagger';
import { Venue } from '../../venues/venue.entity';
import { Box } from '../box.entity';

export class BoxSearchItemDto extends Box {
  @ApiProperty({ type: () => Venue })
  declare venue: Venue;

  @ApiProperty({ example: 420, description: 'Расстояние до заведения, метры' })
  distanceMeters: number;
}

export class SearchBoxesResponseDto {
  @ApiProperty({ type: [BoxSearchItemDto] })
  items: BoxSearchItemDto[];

  @ApiProperty({
    example: 1,
    description: 'Сколько всего нашлось (без учёта limit/offset)',
  })
  total: number;
}
