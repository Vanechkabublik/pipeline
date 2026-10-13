import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VenueMember, VenueRole } from '../venues/venue-member.entity';
import { Venue, VenueStatus } from '../venues/venue.entity';
import { Box, BoxStatus } from './box.entity';
import { CreateBoxDto, SearchBoxesDto } from './boxes.dto';

@Injectable()
export class BoxesService {
  constructor(
    @InjectRepository(Box) private boxes: Repository<Box>,
    @InjectRepository(Venue) private venues: Repository<Venue>,
    @InjectRepository(VenueMember) private members: Repository<VenueMember>,
  ) {}

  async create(userId: string, dto: CreateBoxDto) {
    const isOwner = await this.members.existsBy({
      userId,
      venueId: dto.venueId,
      role: VenueRole.OWNER,
    });
    const venue = await this.venues.findOneBy({ id: dto.venueId });
    if (!isOwner || venue?.status !== VenueStatus.ACTIVE) {
      throw new ForbiddenException(
        'Создавать боксы может только владелец одобренного заведения',
      );
    }

    if (dto.price * 2 > dto.originalPrice) {
      throw new BadRequestException(
        'Цена со скидкой должна быть не больше 50% от исходной',
      );
    }
    if (dto.pickupStart <= new Date()) {
      throw new BadRequestException('Начало выдачи должно быть в будущем');
    }
    const minutes =
      (dto.pickupEnd.getTime() - dto.pickupStart.getTime()) / 60000;
    if (minutes < 30 || minutes > 180) {
      throw new BadRequestException('Окно выдачи — от 30 минут до 3 часов');
    }

    return this.boxes.save(this.boxes.create(dto)); // статус DRAFT по умолчанию
  }

  async publish(userId: string, id: string) {
    const box = await this.boxes.findOneBy({ id });
    if (!box) throw new NotFoundException('Бокс не найден');

    const isOwner = await this.members.existsBy({
      userId,
      venueId: box.venueId,
      role: VenueRole.OWNER,
    });
    if (!isOwner)
      throw new ForbiddenException('Публиковать может только владелец');
    if (box.status !== BoxStatus.DRAFT)
      throw new ConflictException('Опубликовать можно только черновик');

    box.status = BoxStatus.PUBLISHED;
    return this.boxes.save(box);
  }

  async search(query: SearchBoxesDto) {
    // Расстояние в метрах между точкой поиска и заведением (формула гаверсинуса, 6371000 — радиус Земли)
    const distance = `2 * 6371000 * asin(sqrt(
      power(sin(radians(venue.lat - :lat) / 2), 2) +
      cos(radians(:lat)) * cos(radians(venue.lat)) * power(sin(radians(venue.lng - :lng) / 2), 2)
    ))`;

    const qb = this.boxes
      .createQueryBuilder('box')
      .innerJoinAndSelect('box.venue', 'venue')
      .where("box.status = 'PUBLISHED'")
      .andWhere('box.quantity > 0')
      .andWhere('box.pickupEnd > now()')
      .andWhere("venue.status = 'ACTIVE'")
      .andWhere(`${distance} <= :radius`, {
        lat: query.lat,
        lng: query.lng,
        radius: query.radiusKm * 1000,
      });

    if (query.maxPrice !== undefined) {
      qb.andWhere('box.price <= :maxPrice', { maxPrice: query.maxPrice });
    }

    const total = await qb.getCount();
    const { entities, raw } = await qb
      .addSelect(distance, 'distance')
      .orderBy('distance')
      .limit(query.limit)
      .offset(query.offset)
      .getRawAndEntities();

    // entities — боксы, raw — «сырые» строки, где лежит посчитанное distance
    const items = entities.map((box, i) => ({
      ...box,
      distanceMeters: Math.round(raw[i].distance),
    }));
    return { items, total };
  }
}
