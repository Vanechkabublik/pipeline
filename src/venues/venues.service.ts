import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { VenueMember, VenueRole } from './venue-member.entity';
import { Venue, VenueStatus } from './venue.entity';
import { CreateVenueDto } from './venues.dto';

@Injectable()
export class VenuesService {
  constructor(
    private dataSource: DataSource,
    @InjectRepository(Venue) private venues: Repository<Venue>,
    @InjectRepository(VenueMember) private members: Repository<VenueMember>,
    @InjectRepository(User) private users: Repository<User>,
  ) {}

  // Заведение и запись «создатель = OWNER» сохраняются в одной транзакции:
  // если вторая вставка упадёт, откатится и первая
  create(userId: string, dto: CreateVenueDto) {
    return this.dataSource.transaction(async (manager) => {
      const venue = await manager.save(manager.create(Venue, dto));
      await manager.save(
        manager.create(VenueMember, {
          userId,
          venueId: venue.id,
          role: VenueRole.OWNER,
        }),
      );
      return venue;
    });
  }

  async findOne(id: string) {
    const venue = await this.venues.findOne({
      where: { id },
      relations: { boxes: true, members: { user: true } },
    });
    if (!venue) throw new NotFoundException('Заведение не найдено');
    return venue;
  }

  async setStatus(
    id: string,
    status: VenueStatus,
    rejectReason: string | null = null,
  ) {
    const venue = await this.venues.findOneBy({ id });
    if (!venue) throw new NotFoundException('Заведение не найдено');
    venue.status = status;
    venue.rejectReason = rejectReason;
    return this.venues.save(venue);
  }

  async addStaff(venueId: string, ownerId: string, email: string) {
    const isOwner = await this.members.existsBy({
      venueId,
      userId: ownerId,
      role: VenueRole.OWNER,
    });
    if (!isOwner)
      throw new ForbiddenException(
        'Добавлять сотрудников может только владелец',
      );

    const user = await this.users.findOneBy({ email: email.toLowerCase() });
    if (!user) throw new NotFoundException('Пользователь не найден');

    if (await this.members.existsBy({ venueId, userId: user.id })) {
      throw new ConflictException('Пользователь уже в этом заведении');
    }
    return this.members.save(
      this.members.create({ venueId, userId: user.id, role: VenueRole.STAFF }),
    );
  }
}
