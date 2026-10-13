import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { isUniqueViolation } from '../common/db-errors';
import { ErrorCode } from '../common/error-codes';
import { UsersService } from '../users/users.service';
import { CreateVenueDto } from './dto/create-venue.dto';
import { VenueMember, VenueRole } from './venue-member.entity';
import { Venue, VenueStatus } from './venue.entity';

@Injectable()
export class VenuesService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Venue)
    private readonly venuesRepository: Repository<Venue>,
    @InjectRepository(VenueMember)
    private readonly membersRepository: Repository<VenueMember>,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Создаёт заведение (PENDING) и делает создателя OWNER.
   * Обе вставки — в одной транзакции: не бывает заведения без владельца,
   * если вторая вставка упадёт, откатится и первая.
   */
  create(userId: string, dto: CreateVenueDto): Promise<Venue> {
    return this.dataSource.transaction(async (manager) => {
      const venue = await manager.save(
        manager.create(Venue, { ...dto, status: VenueStatus.PENDING }),
      );
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

  /** Заведение вместе с боксами и участниками (у участников — данные пользователя) */
  async findOneWithDetails(id: string): Promise<Venue> {
    const venue = await this.venuesRepository.findOne({
      where: { id },
      relations: { boxes: true, members: { user: true } },
      order: { boxes: { pickupStart: 'ASC' } },
    });
    if (!venue) {
      throw this.venueNotFound();
    }
    return venue;
  }

  async findById(id: string): Promise<Venue> {
    const venue = await this.venuesRepository.findOneBy({ id });
    if (!venue) {
      throw this.venueNotFound();
    }
    return venue;
  }

  async approve(id: string): Promise<Venue> {
    const venue = await this.findById(id);
    venue.status = VenueStatus.ACTIVE;
    venue.rejectReason = null;
    return this.venuesRepository.save(venue);
  }

  async reject(id: string, reason: string): Promise<Venue> {
    const venue = await this.findById(id);
    venue.status = VenueStatus.REJECTED;
    venue.rejectReason = reason;
    return this.venuesRepository.save(venue);
  }

  /** OWNER добавляет сотрудника по email */
  async addStaff(
    venueId: string,
    ownerId: string,
    email: string,
  ): Promise<VenueMember> {
    await this.findById(venueId);
    await this.assertOwner(ownerId, venueId);

    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new NotFoundException({
        code: ErrorCode.USER_NOT_FOUND,
        message: 'Пользователь с таким email не найден',
      });
    }

    try {
      return await this.membersRepository.save(
        this.membersRepository.create({
          userId: user.id,
          venueId,
          role: VenueRole.STAFF,
        }),
      );
    } catch (error) {
      // UNIQUE(userId, venueId): пользователь уже OWNER или STAFF этого заведения
      if (isUniqueViolation(error)) {
        throw new ConflictException({
          code: ErrorCode.ALREADY_MEMBER,
          message: 'Пользователь уже состоит в этом заведении',
        });
      }
      throw error;
    }
  }

  /**
   * Роль пользователя в заведении или null, если он не участник.
   * manager передаётся, когда проверка идёт внутри транзакции.
   */
  async getMemberRole(
    userId: string,
    venueId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<VenueRole | null> {
    const member = await manager.findOneBy(VenueMember, { userId, venueId });
    return member?.role ?? null;
  }

  async assertOwner(userId: string, venueId: string): Promise<void> {
    const role = await this.getMemberRole(userId, venueId);
    if (role !== VenueRole.OWNER) {
      throw new ForbiddenException({
        code: ErrorCode.NOT_VENUE_OWNER,
        message: 'Действие доступно только владельцу заведения',
      });
    }
  }

  /** OWNER или STAFF — например, для выдачи заказа */
  async assertMember(userId: string, venueId: string): Promise<void> {
    const role = await this.getMemberRole(userId, venueId);
    if (!role) {
      throw new ForbiddenException({
        code: ErrorCode.NOT_VENUE_MEMBER,
        message: 'Действие доступно только сотрудникам заведения',
      });
    }
  }

  private venueNotFound() {
    return new NotFoundException({
      code: ErrorCode.VENUE_NOT_FOUND,
      message: 'Заведение не найдено',
    });
  }
}
