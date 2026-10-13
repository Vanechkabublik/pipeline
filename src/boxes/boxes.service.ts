import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ErrorCode } from '../common/error-codes';
import { validationException } from '../common/validation';
import { VenueStatus } from '../venues/venue.entity';
import { VenuesService } from '../venues/venues.service';
import { Box, BoxStatus } from './box.entity';
import { validateBoxRules } from './box-rules';
import { CreateBoxDto } from './dto/create-box.dto';
import { SearchBoxesResponseDto } from './dto/search-boxes-response.dto';
import { SearchBoxesQueryDto } from './dto/search-boxes.query.dto';

/**
 * Расстояние в метрах от точки (:lat, :lng) до заведения по формуле гаверсинуса.
 * 6371000 — средний радиус Земли в метрах. venue.lat / venue.lng TypeORM
 * сам превратит в "venue"."lat" / "venue"."lng".
 */
const DISTANCE_SQL = `(2 * 6371000 * asin(sqrt(
  power(sin(radians(venue.lat - :lat) / 2), 2) +
  cos(radians(:lat)) * cos(radians(venue.lat)) *
  power(sin(radians(venue.lng - :lng) / 2), 2)
)))`;

@Injectable()
export class BoxesService {
  constructor(
    @InjectRepository(Box)
    private readonly boxesRepository: Repository<Box>,
    private readonly venuesService: VenuesService,
  ) {}

  async create(userId: string, dto: CreateBoxDto): Promise<Box> {
    const venue = await this.venuesService.findById(dto.venueId);
    await this.venuesService.assertOwner(userId, venue.id);
    if (venue.status !== VenueStatus.ACTIVE) {
      throw new ForbiddenException({
        code: ErrorCode.VENUE_NOT_ACTIVE,
        message: 'Создавать боксы можно только в одобренном заведении',
      });
    }

    const errors = validateBoxRules(dto);
    if (Object.keys(errors).length > 0) {
      throw validationException(errors);
    }

    return this.boxesRepository.save(
      this.boxesRepository.create({ ...dto, status: BoxStatus.DRAFT }),
    );
  }

  async publish(userId: string, boxId: string): Promise<Box> {
    const box = await this.findById(boxId);
    await this.venuesService.assertOwner(userId, box.venueId);
    if (box.status !== BoxStatus.DRAFT) {
      throw new ConflictException({
        code: ErrorCode.BOX_NOT_DRAFT,
        message: 'Опубликовать можно только черновик',
      });
    }
    box.status = BoxStatus.PUBLISHED;
    return this.boxesRepository.save(box);
  }

  async findById(id: string): Promise<Box> {
    const box = await this.boxesRepository.findOneBy({ id });
    if (!box) {
      throw new NotFoundException({
        code: ErrorCode.BOX_NOT_FOUND,
        message: 'Бокс не найден',
      });
    }
    return box;
  }

  /**
   * Публичный поиск: опубликованные боксы с остатком, у которых выдача ещё не
   * закончилась, в активных заведениях в радиусе radiusKm. Ближайшие — первыми.
   */
  async search(query: SearchBoxesQueryDto): Promise<SearchBoxesResponseDto> {
    const qb = this.boxesRepository
      .createQueryBuilder('box')
      .innerJoinAndSelect('box.venue', 'venue')
      .where('box.status = :status', { status: BoxStatus.PUBLISHED })
      .andWhere('box.quantity > 0')
      .andWhere('box.pickupEnd > now()')
      .andWhere('venue.status = :venueStatus', {
        venueStatus: VenueStatus.ACTIVE,
      })
      .andWhere(`${DISTANCE_SQL} <= :radiusMeters`, {
        lat: query.lat,
        lng: query.lng,
        radiusMeters: query.radiusKm * 1000,
      });

    if (query.maxPrice !== undefined) {
      qb.andWhere('box.price <= :maxPrice', { maxPrice: query.maxPrice });
    }

    // total — по тем же условиям, но без limit/offset
    const total = await qb.getCount();

    // getRawAndEntities: entities — объекты Box (с venue), raw — «сырые» строки,
    // где лежит вычисленное поле distance, которого нет в сущности
    const { entities, raw } = await qb
      .addSelect(DISTANCE_SQL, 'distance')
      .orderBy('distance', 'ASC')
      .limit(query.limit)
      .offset(query.offset)
      .getRawAndEntities<{ box_id: string; distance: number }>();

    const distanceByBoxId = new Map(
      raw.map((row) => [row.box_id, Number(row.distance)]),
    );
    const items = entities.map((box) => ({
      ...box,
      distanceMeters: Math.round(distanceByBoxId.get(box.id) ?? 0),
    }));

    return { items, total };
  }
}
