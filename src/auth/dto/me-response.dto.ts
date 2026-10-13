import { ApiProperty } from '@nestjs/swagger';
import { User } from '../../users/user.entity';
import { Venue } from '../../venues/venue.entity';
import { VenueMember } from '../../venues/venue-member.entity';

/** Только для документации Swagger: так выглядит ответ GET /auth/me */
export class MembershipDto extends VenueMember {
  @ApiProperty({ type: () => Venue })
  declare venue: Venue;
}

export class MeResponseDto extends User {
  @ApiProperty({ type: [MembershipDto] })
  declare memberships: MembershipDto[];
}
